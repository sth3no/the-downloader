import { describe, it, expect } from "vitest";
import { buildGalleryArgs } from "../src/lib/gallerydl.js";

describe("buildGalleryArgs", () => {
  it("sets the base destination with -d", () => {
    expect(buildGalleryArgs({ url: "https://imgur.com/a/x", destination: "/Downloads" }))
      .toEqual(["-d", "/Downloads", "https://imgur.com/a/x"]);
  });

  it("adds --cookies-from-browser when a browser is set", () => {
    expect(buildGalleryArgs({ url: "https://pixiv.net/u/1", destination: "/d", cookiesFromBrowser: "safari" }))
      .toEqual(["-d", "/d", "--cookies-from-browser", "safari", "https://pixiv.net/u/1"]);
  });

  it("omits cookies when none is set", () => {
    expect(buildGalleryArgs({ url: "https://imgur.com/a/x", destination: "/d", cookiesFromBrowser: "" }))
      .not.toContain("--cookies-from-browser");
  });
});
