import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveBinary } from "../src/lib/binary";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

import * as fs from "node:fs";

afterEach(() => vi.restoreAllMocks());

describe("resolveBinary", () => {
  it("returns the preference path when it exists on disk", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(resolveBinary("yt-dlp", "/custom/bin/yt-dlp")).toBe("/custom/bin/yt-dlp");
  });

  it("falls back to a default path when the preference is missing", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(resolveBinary("yt-dlp", "/missing/yt-dlp")).toBe("/opt/homebrew/bin/yt-dlp");
  });

  it("resolves a default path when no preference is given", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(resolveBinary("gallery-dl")).toBe("/opt/homebrew/bin/gallery-dl");
  });
});
