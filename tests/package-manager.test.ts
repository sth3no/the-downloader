import { beforeEach, describe, it, expect, vi } from "vitest";

const { getWingetPath, downloadSpotdl, execa } = vi.hoisted(() => ({
  getWingetPath: vi.fn(),
  downloadSpotdl: vi.fn(),
  execa: vi.fn(),
}));

// Run `upgrade` as on Windows whatever the host: utils is replaced outright,
// and the winget package list is pinned because tools.ts derives it from the
// host platform at load time.
vi.mock("../src/utils.js", () => ({
  isWindows: true,
  isMac: false,
  getWingetPath,
  getHomebrewPath: vi.fn(),
  getSpotdlPath: vi.fn(),
}));
vi.mock("../src/lib/tools.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/tools")>()),
  HOMEBREW_FORMULAE: [],
  WINGET_PACKAGES: ["yt-dlp.yt-dlp", "yt-dlp.FFmpeg"],
}));
vi.mock("../src/lib/managed-binary.js", () => ({
  downloadSpotdl,
  getInstalledVersion: vi.fn(),
  getLatestRelease: vi.fn(),
  isManagedBinary: vi.fn(),
}));
vi.mock("execa", () => ({ execa }));

import { upgrade } from "../src/lib/package-manager";

const WINGET_MISSING = "Winget not found. Please ensure winget is installed and available in your PATH.";

beforeEach(() => {
  vi.clearAllMocks();
  downloadSpotdl.mockResolvedValue(undefined);
  execa.mockResolvedValue({ stdout: "" });
});

describe("upgrade on Windows without winget", () => {
  beforeEach(() => {
    getWingetPath.mockRejectedValue(new Error(WINGET_MISSING));
  });

  it("still re-downloads spotDL, which comes from GitHub, not winget", async () => {
    // Regression: winget was looked up first, so its absence threw before spotDL ran.
    await expect(upgrade({ spotdl: "4.5.0" })).resolves.toEqual({ issues: [], attempted: 1 });
    expect(downloadSpotdl).toHaveBeenCalledTimes(1);
    expect(getWingetPath).not.toHaveBeenCalled();
  });

  it("reports each outdated winget package as an issue instead of throwing", async () => {
    const result = await upgrade({ "yt-dlp.yt-dlp": "2026.10.21", "yt-dlp.FFmpeg": "N-127500", spotdl: "4.5.0" });
    expect(result).toEqual({
      issues: [
        { pkg: "yt-dlp.yt-dlp", message: WINGET_MISSING },
        { pkg: "yt-dlp.FFmpeg", message: WINGET_MISSING },
      ],
      attempted: 3,
    });
    expect(downloadSpotdl).toHaveBeenCalledTimes(1);
    expect(execa).not.toHaveBeenCalled();
  });
});

describe("upgrade on Windows with winget", () => {
  it("upgrades only the outdated winget packages through the winget it found", async () => {
    getWingetPath.mockResolvedValue("C:\\winget.exe");
    await expect(upgrade({ "yt-dlp.FFmpeg": "N-127500" })).resolves.toEqual({ issues: [], attempted: 1 });
    expect(execa).toHaveBeenCalledTimes(1);
    expect(execa).toHaveBeenCalledWith(
      "C:\\winget.exe",
      expect.arrayContaining(["upgrade", "--id", "yt-dlp.FFmpeg"]),
      expect.anything(),
    );
    expect(downloadSpotdl).not.toHaveBeenCalled();
  });
});
