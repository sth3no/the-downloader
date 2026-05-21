import { spawn, ChildProcess } from "node:child_process";

/**
 * Default watchdog idle window. Real downloads emit progress lines well within
 * two minutes even on slow networks; a longer gap usually means the child is
 * wedged on auth or a network stall. Production call sites override this via
 * the `networkIdleTimeoutSec` user preference; tests and direct callers may
 * accept the default.
 */
export const DEFAULT_IDLE_MS = 120_000;

export type RunOptions = {
  /** Maximum ms of silence (no stdout/stderr) before the child is killed and the promise rejects. */
  idleMs: number;
  /** Environment for the child. Defaults to the parent's `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Called per stdout chunk so callers can parse incremental progress. The full stdout is also returned on close. */
  onStdoutChunk?: (chunk: string) => void;
  /** Called per stderr chunk. The full stderr is also returned on close. */
  onStderrChunk?: (chunk: string) => void;
  /** Override the rejection message when the watchdog fires. */
  idleKillMessage?: string;
  /** Aborting the signal kills the child and rejects with an AbortError. Used for cancel buttons and component-unmount cleanup. */
  abortSignal?: AbortSignal;
};

/** Thrown when a child is killed because the caller aborted its signal. Distinct from a watchdog kill — caller-initiated, not the timeout. */
export class AbortError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortError";
  }
}

export type RunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

/**
 * Spawn a child process with hang-prevention baked in: stdin is closed so the
 * tool cannot block waiting on an interactive prompt (yt-dlp's 2FA prompt,
 * gallery-dl's password ask, etc.), and an idle watchdog kills the child when
 * neither stream emits anything for `idleMs`. Resolves with the exit code and
 * accumulated streams; rejects on spawn error or watchdog kill. Callers parse
 * stdout/stderr themselves and decide what a non-zero exit means.
 */
export function runWithWatchdog(binary: string, args: string[], options: RunOptions): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // Reject up front if the signal is already aborted — no point spawning.
    if (options.abortSignal?.aborted) {
      reject(new AbortError());
      return;
    }
    const child = spawn(binary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env ?? process.env,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (idleTimer) clearTimeout(idleTimer);
      options.abortSignal?.removeEventListener("abort", onAbort);
      fn();
    };

    const onAbort = () => {
      settle(() => {
        try {
          child.kill();
        } catch {
          /* child may already be dead */
        }
        reject(new AbortError());
      });
    };
    options.abortSignal?.addEventListener("abort", onAbort, { once: true });

    const resetIdle = () => {
      if (settled) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        settle(() => {
          try {
            child.kill();
          } catch {
            /* child may already be dead */
          }
          const seconds = Math.round(options.idleMs / 1000);
          reject(
            new Error(
              options.idleKillMessage ??
                `${binary} produced no output for ${seconds}s and was killed. This usually means it is stuck on an auth or network step; retry, or raise the Network: Idle Timeout preference.`,
            ),
          );
        });
      }, options.idleMs);
    };
    resetIdle();

    child.stdout?.on("data", (data: Buffer) => {
      resetIdle();
      const text = data.toString();
      stdout += text;
      options.onStdoutChunk?.(text);
    });
    child.stderr?.on("data", (data: Buffer) => {
      resetIdle();
      const text = data.toString();
      stderr += text;
      options.onStderrChunk?.(text);
    });
    child.on("error", (err) => settle(() => reject(err)));
    child.on("close", (code) => {
      settle(() => resolve({ code, stdout, stderr }));
    });
  });
}

export type { ChildProcess };
