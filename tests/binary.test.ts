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
    const result = resolveBinary("yt-dlp", "/missing/yt-dlp");
    expect(result).toContain("yt-dlp");
    expect(result).not.toBe("/missing/yt-dlp");
  });

  it("resolves a default path when no preference is given", () => {
    expect(resolveBinary("gallery-dl")).toContain("gallery-dl");
  });
});
