import { describe, it, expect, vi } from "vitest";

// Mock @raycast/api before importing config
vi.mock("@raycast/api", () => ({
  getPreferenceValues: vi.fn(() => ({})),
}));

import { videoFormatSelector } from "../src/lib/config";

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
});
