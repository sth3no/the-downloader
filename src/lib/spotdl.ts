import { spawn } from "node:child_process";
import path from "node:path";

export type SpotdlDownloadOptions = {
  url: string;
  destination: string;
  format: string;
  ffmpegPath: string;
  /** Spotify API credentials. Both must be present and non-empty for either to be passed. */
  clientId?: string;
  clientSecret?: string;
  /**
   * When true (and credentials are present), append `--user-auth` so spotDL runs
   * the OAuth Authorization Code flow on first use — required to read private
   * playlists or library content. The Dev app must have `http://127.0.0.1:9900/`
   * registered as a Redirect URI; the watchdog in `runSpotdlDownload` kills the
   * child if the callback never arrives.
   */
  userAuth?: boolean;
};

/**
 * Build spotDL CLI args. Files are written as `<artists> - <title>.<ext>` in
 * the destination. When both Spotify API credentials are provided, they are
 * appended together with `--use-official-api` so spotDL talks only to the
 * Spotify Web API. Without that flag spotDL still falls into librespot for
 * track-hash checks (`_get_auth_vars` → "Could not get session auth tokens"),
 * which depends on a third-party host (`code.thetadev.de`) for current secrets
 * and outdated bundled fallbacks — both broken in practice.
 */
export function buildSpotdlArgs(o: SpotdlDownloadOptions): string[] {
  const args = [
    "download",
    o.url,
    "--output",
    path.join(o.destination, "{artists} - {title}.{output-ext}"),
    "--format",
    o.format,
    "--ffmpeg",
    o.ffmpegPath,
  ];
  const id = o.clientId?.trim();
  const secret = o.clientSecret?.trim();
  if (id && secret) {
    args.push("--client-id", id, "--client-secret", secret, "--use-official-api");
    if (o.userAuth) {
      args.push("--user-auth");
    }
  }
  return args;
}

export type SpotdlProgress = { tracks: number };

/**
 * Kill spotdl after this long with no stdout/stderr output. Real downloads emit
 * progress lines well within this window even on slow networks. A silent gap
 * past it means spotdl is wedged (e.g. waiting on an OAuth callback that won't
 * arrive under Raycast) — better to surface a clear error than leave zombies.
 */
const SPOTDL_IDLE_TIMEOUT_MS = 120_000;

/**
 * Run spotDL; onProgress fires as tracks complete. Resolves with the track count
 * or rejects with the failure output. spotDL is Python+Rich-based and routinely
 * prints tracebacks/errors to stdout rather than stderr, so stdout is captured
 * and used as the error message when stderr is empty. stdin is closed so spotdl
 * can never fall back to interactive prompts (which would hang forever), and a
 * watchdog kills the child if no output arrives within the idle window.
 */
export function runSpotdlDownload(
  binaryPath: string,
  options: SpotdlDownloadOptions,
  onProgress: (p: SpotdlProgress) => void,
): Promise<SpotdlProgress> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, buildSpotdlArgs(options), {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let tracks = 0;
    let stdout = "";
    let stderr = "";
    let settled = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (idleTimer) clearTimeout(idleTimer);
      fn();
    };

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
          reject(
            new Error(
              `spotdl produced no output for 2 minutes and was killed. This usually means it is stuck on an auth or network step; check SPOTIFY.md or retry.`,
            ),
          );
        });
      }, SPOTDL_IDLE_TIMEOUT_MS);
    };
    resetIdle();

    child.stdout.on("data", (data: Buffer) => {
      resetIdle();
      const text = data.toString();
      stdout += text;
      // spotDL prints one "Downloaded ..." line per completed track.
      const completed = text.split("\n").filter((line) => line.includes("Downloaded")).length;
      if (completed > 0) {
        tracks += completed;
        onProgress({ tracks });
      }
    });
    child.stderr.on("data", (data: Buffer) => {
      resetIdle();
      stderr += data.toString();
    });
    child.on("error", (err) => settle(() => reject(err)));
    child.on("close", (code) => {
      settle(() => {
        if (code === 0) resolve({ tracks });
        else reject(new Error(stderr.trim() || stdout.trim() || `spotdl exited with code ${code}`));
      });
    });
  });
}
