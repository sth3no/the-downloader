import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { spawn } from "node:child_process";
import { DEFAULT_IDLE_MS, runWithWatchdog } from "../src/lib/run";

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

afterEach(() => vi.restoreAllMocks());

describe("DEFAULT_IDLE_MS", () => {
  it("is 120 seconds — the same value spotDL used as a hardcoded constant before this helper existed", () => {
    expect(DEFAULT_IDLE_MS).toBe(120_000);
  });
});

describe("runWithWatchdog", () => {
  it("spawns with stdin closed so the child can never hang on an interactive prompt", () => {
    const child = fakeChild();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(child);

    runWithWatchdog("/bin/x", ["arg"], { idleMs: 1_000 });

    expect(spawn).toHaveBeenCalledWith(
      "/bin/x",
      ["arg"],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }),
    );
  });

  it("resolves with code + accumulated stdout/stderr on close", async () => {
    const child = fakeChild();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(child);

    const promise = runWithWatchdog("/bin/x", [], { idleMs: 1_000 });
    child.stdout.emit("data", Buffer.from("hello "));
    child.stdout.emit("data", Buffer.from("world\n"));
    child.stderr.emit("data", Buffer.from("warn\n"));
    child.emit("close", 0);

    await expect(promise).resolves.toEqual({ code: 0, stdout: "hello world\n", stderr: "warn\n" });
  });

  it("resolves with a non-zero code rather than rejecting — caller decides what failure means", async () => {
    const child = fakeChild();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(child);

    const promise = runWithWatchdog("/bin/x", [], { idleMs: 1_000 });
    child.stderr.emit("data", Buffer.from("boom"));
    child.emit("close", 1);

    await expect(promise).resolves.toEqual({ code: 1, stdout: "", stderr: "boom" });
  });

  it("rejects when spawn emits an 'error' event (e.g. ENOENT)", async () => {
    const child = fakeChild();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(child);

    const promise = runWithWatchdog("/bin/x", [], { idleMs: 1_000 });
    child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));

    await expect(promise).rejects.toThrow(/ENOENT/);
  });

  it("kills the child and rejects when no chunk arrives for idleMs", async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(child);

      const promise = runWithWatchdog("/bin/x", [], { idleMs: 5_000 });
      const assertion = expect(promise).rejects.toThrow(/no output for 5s/);

      await vi.advanceTimersByTimeAsync(6_000);

      await assertion;
      expect(child.kill).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets the idle timer on every chunk — a steady drip of output is never killed", async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(child);

      const promise = runWithWatchdog("/bin/x", [], { idleMs: 5_000 });

      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(3_000);
        child.stdout.emit("data", Buffer.from("progress\n"));
      }
      child.emit("close", 0);

      await expect(promise).resolves.toMatchObject({ code: 0 });
      expect(child.kill).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("invokes onStdoutChunk / onStderrChunk so callers can parse incremental progress", async () => {
    const child = fakeChild();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(child);

    const onStdoutChunk = vi.fn();
    const onStderrChunk = vi.fn();

    const promise = runWithWatchdog("/bin/x", [], { idleMs: 1_000, onStdoutChunk, onStderrChunk });
    child.stdout.emit("data", Buffer.from("a"));
    child.stderr.emit("data", Buffer.from("b"));
    child.emit("close", 0);

    await promise;
    expect(onStdoutChunk).toHaveBeenCalledWith("a");
    expect(onStderrChunk).toHaveBeenCalledWith("b");
  });

  it("uses idleKillMessage in the rejection when provided", async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild();
      (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(child);

      const promise = runWithWatchdog("/bin/x", [], {
        idleMs: 1_000,
        idleKillMessage: "custom-stuck-message",
      });
      const assertion = expect(promise).rejects.toThrow(/custom-stuck-message/);

      await vi.advanceTimersByTimeAsync(2_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
