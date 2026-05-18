import { describe, it, expect } from "vitest";
import { detectSource } from "../src/lib/detect";

describe("detectSource", () => {
  it("routes known video domains to video", () => {
    expect(detectSource("https://www.youtube.com/watch?v=abc")).toBe("video");
    expect(detectSource("https://youtu.be/abc")).toBe("video");
    expect(detectSource("https://twitch.tv/stream")).toBe("video");
  });

  it("routes known gallery domains to gallery", () => {
    expect(detectSource("https://www.reddit.com/r/pics")).toBe("gallery");
    expect(detectSource("https://imgur.com/a/abc")).toBe("gallery");
    expect(detectSource("https://www.pixiv.net/en/users/123")).toBe("gallery");
  });

  it("defaults unknown domains to video", () => {
    expect(detectSource("https://unknown-site.example/x")).toBe("video");
  });

  it("handles URLs without a protocol", () => {
    expect(detectSource("youtube.com/watch?v=abc")).toBe("video");
  });

  it("routes Spotify links to spotify", () => {
    expect(detectSource("https://open.spotify.com/track/abc")).toBe("spotify");
    expect(detectSource("https://open.spotify.com/playlist/xyz")).toBe("spotify");
    expect(detectSource("https://open.spotify.com/album/123")).toBe("spotify");
  });
});
