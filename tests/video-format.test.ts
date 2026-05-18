import { describe, it, expect } from "vitest";
import { videoFormatSelector, composeVideoFormat } from "../src/lib/video-format";

describe("videoFormatSelector", () => {
  it("maps 'best' to an uncapped selector", () => {
    expect(videoFormatSelector("best")).toBe("bestvideo+bestaudio/best");
  });

  it("maps '1080' to a 1080-capped selector", () => {
    expect(videoFormatSelector("1080")).toBe(
      "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
    );
  });

  it("maps '720' to a 720-capped selector", () => {
    expect(videoFormatSelector("720")).toBe(
      "bestvideo[height<=720]+bestaudio/best[height<=720]",
    );
  });

  it("maps '480' to a 480-capped selector", () => {
    expect(videoFormatSelector("480")).toBe(
      "bestvideo[height<=480]+bestaudio/best[height<=480]",
    );
  });

  it("maps 'smallest' to a worst-quality selector", () => {
    expect(videoFormatSelector("smallest")).toBe("worstvideo+worstaudio/worst");
  });

  it("falls back to the uncapped selector for an unrecognised token", () => {
    expect(videoFormatSelector("360")).toBe("bestvideo+bestaudio/best");
  });
});

describe("composeVideoFormat", () => {
  it("composes a video format as '<selector>#<container>'", () => {
    expect(
      composeVideoFormat({ mediaType: "video", quality: "best", container: "mp4", audioFormat: "mp3" }),
    ).toBe("bestvideo+bestaudio/best#mp4");
  });

  it("applies the quality cap and container for video", () => {
    expect(
      composeVideoFormat({ mediaType: "video", quality: "1080", container: "mkv", audioFormat: "mp3" }),
    ).toBe("bestvideo[height<=1080]+bestaudio/best[height<=1080]#mkv");
  });

  it("composes an audio format as 'bestaudio#<audioFormat>', ignoring quality and container", () => {
    expect(
      composeVideoFormat({ mediaType: "audio", quality: "1080", container: "mp4", audioFormat: "opus" }),
    ).toBe("bestaudio#opus");
  });

  it("passes the chosen audio format through", () => {
    expect(
      composeVideoFormat({ mediaType: "audio", quality: "best", container: "mp4", audioFormat: "m4a" }),
    ).toBe("bestaudio#m4a");
  });
});
