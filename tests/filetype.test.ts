import { describe, it, expect } from "vitest";
import { defaultFiletype, requiredTools, resolveTool } from "../src/lib/filetype";

describe("defaultFiletype", () => {
  it("maps a gallery source to image", () => {
    expect(defaultFiletype("gallery", false)).toBe("image");
  });
  it("maps a spotify source to audio", () => {
    expect(defaultFiletype("spotify", false)).toBe("audio");
  });
  it("maps a webpage source to website", () => {
    expect(defaultFiletype("webpage", false)).toBe("website");
  });
  it("maps a video source to video when audio is not preferred", () => {
    expect(defaultFiletype("video", false)).toBe("video");
  });
  it("maps a video source to audio when audio is preferred", () => {
    expect(defaultFiletype("video", true)).toBe("audio");
  });
});

describe("resolveTool", () => {
  it("routes video to yt-dlp", () => {
    expect(resolveTool("video", "video")).toBe("yt-dlp");
  });
  it("routes transcript to yt-dlp", () => {
    expect(resolveTool("video", "transcript")).toBe("yt-dlp");
  });
  it("routes audio on a Spotify source to spotdl", () => {
    expect(resolveTool("spotify", "audio")).toBe("spotdl");
  });
  it("routes audio elsewhere to yt-dlp", () => {
    expect(resolveTool("video", "audio")).toBe("yt-dlp");
  });
  it("routes image on a gallery source to gallery-dl", () => {
    expect(resolveTool("gallery", "image")).toBe("gallery-dl");
  });
  it("routes image elsewhere to yt-dlp (thumbnail)", () => {
    expect(resolveTool("video", "image")).toBe("yt-dlp");
  });
  it("routes website to monolith", () => {
    expect(resolveTool("webpage", "website")).toBe("monolith");
  });
});

describe("requiredTools", () => {
  it("video needs the full yt-dlp toolchain", () => {
    expect(requiredTools("video", "video")).toEqual(["yt-dlp", "ffmpeg", "ffprobe", "deno"]);
  });
  it("audio on a video site needs the full yt-dlp toolchain", () => {
    expect(requiredTools("video", "audio")).toEqual(["yt-dlp", "ffmpeg", "ffprobe", "deno"]);
  });
  it("audio on a Spotify source needs spotdl + ffmpeg", () => {
    expect(requiredTools("spotify", "audio")).toEqual(["spotdl", "ffmpeg"]);
  });
  it("image on a gallery source needs gallery-dl", () => {
    expect(requiredTools("gallery", "image")).toEqual(["gallery-dl"]);
  });
  it("image on a video site needs yt-dlp + ffmpeg", () => {
    expect(requiredTools("video", "image")).toEqual(["yt-dlp", "ffmpeg"]);
  });
  it("transcript needs yt-dlp + ffmpeg", () => {
    expect(requiredTools("video", "transcript")).toEqual(["yt-dlp", "ffmpeg"]);
  });
  it("website needs monolith", () => {
    expect(requiredTools("webpage", "website")).toEqual(["monolith"]);
  });
});
