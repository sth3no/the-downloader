import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { spawn } from "node:child_process";
import { buildSpotdlArgs, runSpotdlDownload } from "../src/lib/spotdl";

function fakeChild() {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

describe("buildSpotdlArgs", () => {
  it("builds a download command with url, output template, format and ffmpeg path", () => {
    expect(
      buildSpotdlArgs({
        url: "https://open.spotify.com/track/abc",
        destination: "/Downloads",
        format: "mp3",
        ffmpegPath: "/opt/homebrew/bin/ffmpeg",
      }),
    ).toEqual([
      "download",
      "https://open.spotify.com/track/abc",
      "--output",
      "/Downloads/{artists} - {title}.{output-ext}",
      "--format",
      "mp3",
      "--ffmpeg",
      "/opt/homebrew/bin/ffmpeg",
    ]);
  });

  it("passes the chosen audio format through", () => {
    expect(
      buildSpotdlArgs({
        url: "https://open.spotify.com/track/x",
        destination: "/d",
        format: "flac",
        ffmpegPath: "/ff",
      }),
    ).toContain("flac");
  });

  it("appends --client-id, --client-secret and --use-official-api when both creds are provided", () => {
    const args = buildSpotdlArgs({
      url: "https://open.spotify.com/track/x",
      destination: "/d",
      format: "mp3",
      ffmpegPath: "/ff",
      clientId: "id123",
      clientSecret: "secretXYZ",
    });
    expect(args).toContain("--client-id");
    expect(args).toContain("id123");
    expect(args).toContain("--client-secret");
    expect(args).toContain("secretXYZ");
    // --use-official-api is what actually bypasses the broken librespot path;
    // without it, the credentials alone are not enough.
    expect(args).toContain("--use-official-api");
  });

  it("appends --user-auth when userAuth is true and credentials are provided", () => {
    const args = buildSpotdlArgs({
      url: "https://open.spotify.com/playlist/x",
      destination: "/d",
      format: "mp3",
      ffmpegPath: "/ff",
      clientId: "id",
      clientSecret: "secret",
      userAuth: true,
    });
    expect(args).toContain("--user-auth");
  });

  it("omits --user-auth when userAuth is true but credentials are missing", () => {
    // --user-auth alone is useless without a Dev app to authenticate against,
    // so the flag should not leak through when credentials aren't set.
    const args = buildSpotdlArgs({
      url: "https://open.spotify.com/playlist/x",
      destination: "/d",
      format: "mp3",
      ffmpegPath: "/ff",
      userAuth: true,
    });
    expect(args).not.toContain("--user-auth");
  });

  it("omits --user-auth when userAuth is false or undefined, even with credentials", () => {
    for (const userAuth of [false, undefined]) {
      const args = buildSpotdlArgs({
        url: "https://open.spotify.com/track/x",
        destination: "/d",
        format: "mp3",
        ffmpegPath: "/ff",
        clientId: "id",
        clientSecret: "secret",
        userAuth,
      });
      expect(args).not.toContain("--user-auth");
    }
  });

  it("omits --client-id, --client-secret and --use-official-api when missing, empty, or whitespace", () => {
    const baseline = {
      url: "https://open.spotify.com/track/x",
      destination: "/d",
      format: "mp3",
      ffmpegPath: "/ff",
    };
    for (const variant of [
      baseline,
      { ...baseline, clientId: "", clientSecret: "" },
      { ...baseline, clientId: "  ", clientSecret: "  " },
      { ...baseline, clientId: "id-only", clientSecret: "" },
      { ...baseline, clientId: "", clientSecret: "secret-only" },
    ]) {
      const args = buildSpotdlArgs(variant);
      expect(args).not.toContain("--client-id");
      expect(args).not.toContain("--client-secret");
      expect(args).not.toContain("--use-official-api");
    }
  });
});

describe("runSpotdlDownload", () => {
  it("resolves with the track count and calls onProgress as tracks complete", async () => {
    const child = fakeChild();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(child);

    const onProgress = vi.fn();
    const promise = runSpotdlDownload(
      "/support/spotdl",
      { url: "https://open.spotify.com/playlist/x", destination: "/tmp", format: "mp3", ffmpegPath: "/ff" },
      onProgress,
    );

    child.stdout.emit("data", Buffer.from('Downloaded "A - 1"\nDownloaded "A - 2"\n'));
    child.emit("close", 0);

    await expect(promise).resolves.toEqual({ tracks: 2 });
    expect(onProgress).toHaveBeenCalled();
  });

  it("rejects with the stderr text on a non-zero exit", async () => {
    const child = fakeChild();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(child);

    const promise = runSpotdlDownload(
      "/support/spotdl",
      { url: "https://open.spotify.com/track/bad", destination: "/tmp", format: "mp3", ffmpegPath: "/ff" },
      vi.fn(),
    );

    child.stderr.emit("data", Buffer.from("AudioProviderError"));
    child.emit("close", 1);

    await expect(promise).rejects.toThrow("AudioProviderError");
  });

  it("falls back to stdout when stderr is empty on a non-zero exit", async () => {
    // spotDL is Python+Rich-based and routinely prints tracebacks/errors to
    // stdout, not stderr. Without this fallback the user just sees the bare
    // exit code and has nothing to act on.
    const child = fakeChild();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(child);

    const promise = runSpotdlDownload(
      "/support/spotdl",
      { url: "https://open.spotify.com/track/bad", destination: "/tmp", format: "mp3", ffmpegPath: "/ff" },
      vi.fn(),
    );

    child.stdout.emit("data", Buffer.from("LookupError: Could not find any results for the query\n"));
    child.emit("close", 1);

    await expect(promise).rejects.toThrow("Could not find any results for the query");
  });
});
