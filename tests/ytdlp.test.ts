import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { spawn } from "node:child_process";
import { buildThumbnailArgs, buildVideoDownloadArgs, runVideoDownload } from "../src/lib/ytdlp";

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

describe("buildVideoDownloadArgs", () => {
  const base = { url: "https://example.com/v", outputTemplate: "/out/%(title)s.%(ext)s", ffmpegPath: "/ff" };

  it("extracts audio with the requested format (mp3)", () => {
    expect(buildVideoDownloadArgs({ ...base, format: "bestaudio#mp3" })).toEqual([
      "-o",
      "/out/%(title)s.%(ext)s",
      "--ffmpeg-location",
      "/ff",
      "--extract-audio",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "--progress",
      "--print",
      "after_move:filepath",
      "https://example.com/v",
    ]);
  });

  it("extracts audio as m4a when requested", () => {
    const args = buildVideoDownloadArgs({ ...base, format: "bestaudio#m4a" });
    expect(args).toContain("--extract-audio");
    expect(args[args.indexOf("--audio-format") + 1]).toBe("m4a");
  });

  it("extracts audio as opus when requested", () => {
    const args = buildVideoDownloadArgs({ ...base, format: "bestaudio#opus" });
    expect(args[args.indexOf("--audio-format") + 1]).toBe("opus");
  });

  it("downloads and recodes video for a non-audio format", () => {
    expect(buildVideoDownloadArgs({ ...base, format: "bestvideo+bestaudio/best#mp4" })).toEqual([
      "-o",
      "/out/%(title)s.%(ext)s",
      "--ffmpeg-location",
      "/ff",
      "--format",
      "bestvideo+bestaudio/best",
      "--recode-video",
      "mp4",
      "--progress",
      "--print",
      "after_move:filepath",
      "https://example.com/v",
    ]);
  });

  it("adds the deno JS runtime when denoPath is given", () => {
    const args = buildVideoDownloadArgs({ ...base, format: "bestaudio#mp3", denoPath: "/deno" });
    expect(args[args.indexOf("--js-runtimes") + 1]).toBe("deno:/deno");
  });
});

describe("runVideoDownload", () => {
  const options = {
    url: "https://example.com/v",
    format: "bestvideo+bestaudio/best#mp4",
    outputTemplate: "/out/%(title)s.%(ext)s",
    ffmpegPath: "/ff",
  };

  it("reports progress and resolves with the downloaded file path", async () => {
    const child = fakeChild();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(child);

    const onProgress = vi.fn();
    const promise = runVideoDownload("/yt-dlp", options, onProgress);

    child.stdout.emit("data", Buffer.from("[download]  42.0% of 10.00MiB\n"));
    child.stdout.emit("data", Buffer.from("/out/My Video.mp4\n"));
    child.emit("close", 0);

    await expect(promise).resolves.toEqual({ filePath: "/out/My Video.mp4" });
    expect(onProgress).toHaveBeenCalledWith(42);
  });

  it("rejects with the stderr text on a non-zero exit", async () => {
    const child = fakeChild();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(child);

    const promise = runVideoDownload("/yt-dlp", options, vi.fn());

    child.stderr.emit("data", Buffer.from("ERROR: Video unavailable"));
    child.emit("close", 1);

    await expect(promise).rejects.toThrow("ERROR: Video unavailable");
  });
});

describe("buildThumbnailArgs", () => {
  it("builds args that fetch only the thumbnail image", () => {
    expect(
      buildThumbnailArgs({ url: "https://example.com/v", outputTemplate: "/out/%(title)s.%(ext)s" }),
    ).toEqual([
      "--write-thumbnail",
      "--skip-download",
      "--no-playlist",
      "-o",
      "/out/%(title)s.%(ext)s",
      "https://example.com/v",
    ]);
  });
});
