import { afterAll, afterEach, beforeAll, describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// utils.ts destructures getPreferenceValues() and imports `environment` at
// module load. `@raycast/api` is aliased to tests/stubs/raycast-api.ts (see
// vitest.config.ts), which supplies downloadPath "~/Downloads" and
// networkIdleTimeoutSec "120".
import { expandTilde, getIdleTimeoutMs, formatFilesize, getVideoFormats } from "../src/utils";
import { Format, Video } from "../src/types";

const originalPlatform = process.platform;
function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
}
function restorePlatform() {
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
}

/** Re-import utils with process.platform mocked so `isWindows` (computed at binary.ts load) flips. */
async function loadUtilsForPlatform(platform: NodeJS.Platform) {
  vi.resetModules();
  setPlatform(platform);
  try {
    return await import("../src/utils");
  } finally {
    restorePlatform();
  }
}

describe("sanitizeVideoTitle (macOS)", () => {
  // Loaded as macOS so these hold on any host: Windows strips more characters (`?` among them).
  let mac: typeof import("../src/utils");
  beforeAll(async () => {
    mac = await loadUtilsForPlatform("darwin");
  });

  it("strips forward slashes so 'AC/DC' can't become a subpath", () => {
    expect(mac.sanitizeVideoTitle("AC/DC - Thunderstruck")).toBe("ACDC - Thunderstruck");
  });

  it("strips backslashes", () => {
    expect(mac.sanitizeVideoTitle("foo\\bar")).toBe("foobar");
  });

  it("strips colons on macOS", () => {
    expect(mac.sanitizeVideoTitle("Episode 1: The Beginning")).toBe("Episode 1 The Beginning");
  });

  it("collapses leading dots so '..\\/etc' can't traverse", () => {
    // Separators are stripped first ("../etc" -> "..etc"), then leading dots.
    expect(mac.sanitizeVideoTitle("../etc/passwd")).toBe("etcpasswd");
  });

  it("removes control characters", () => {
    expect(mac.sanitizeVideoTitle("abc")).toBe("abc");
  });

  it("collapses runs of spaces to a single space", () => {
    expect(mac.sanitizeVideoTitle("a    b     c")).toBe("a b c");
  });

  it("removes control characters such as tabs entirely", () => {
    // Tab is char code 9 (< 32) so it is filtered out, not turned into a space.
    expect(mac.sanitizeVideoTitle("a\tb")).toBe("ab");
  });

  it("falls back to 'untitled' for an all-stripped title", () => {
    expect(mac.sanitizeVideoTitle("///")).toBe("untitled");
    expect(mac.sanitizeVideoTitle("   ")).toBe("untitled");
    expect(mac.sanitizeVideoTitle("...")).toBe("untitled");
  });

  it("truncates at the last sentence-ending punctuation within the max length", () => {
    const long = "First sentence. " + "x".repeat(300);
    expect(mac.sanitizeVideoTitle(long)).toBe("First sentence");
  });

  it("hard-truncates an over-long title with no punctuation boundary", () => {
    expect(mac.sanitizeVideoTitle("x".repeat(300))).toBe("x".repeat(200));
  });

  it("leaves short titles containing punctuation whole (no boundary cut under the cap)", () => {
    // Regression: the boundary cut used to apply unconditionally, chopping
    // every title at its last . ! or ? — "Mr. Robot…" became "Mr".
    expect(mac.sanitizeVideoTitle("Mr. Robot S01E01 Explained")).toBe("Mr. Robot S01E01 Explained");
    expect(mac.sanitizeVideoTitle("What is Love? Haddaway Story")).toBe("What is Love? Haddaway Story");
    expect(mac.sanitizeVideoTitle("iPhone 15.5 Review")).toBe("iPhone 15.5 Review");
    expect(mac.sanitizeVideoTitle("Top 10 Goals!")).toBe("Top 10 Goals!");
  });
});

describe("sanitizeVideoTitle (Windows reserved set)", () => {
  it("strips the full Windows-reserved character set", async () => {
    const utilsWin = await loadUtilsForPlatform("win32");
    expect(utilsWin.sanitizeVideoTitle('a<b>c:d"e/f\\g|h?i*j')).toBe("abcdefghij");
  });

  it("still strips separators on Windows (the always-invalid set)", async () => {
    const utilsWin = await loadUtilsForPlatform("win32");
    expect(utilsWin.sanitizeVideoTitle("AC/DC")).toBe("ACDC");
  });
});

describe("getWingetPath", () => {
  // Real files stand in for two installed wingets (stable + preview), so the
  // on-disk check runs for real on any host. `where` is mocked to list them.
  let dir: string;
  let stable: string;
  let preview: string;
  let missing: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "winget-path-"));
    stable = path.join(dir, "stable-winget.exe");
    preview = path.join(dir, "preview-winget.exe");
    missing = path.join(dir, "missing-winget.exe");
    fs.writeFileSync(stable, "");
    fs.writeFileSync(preview, "");
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  afterEach(() => {
    vi.doUnmock("child_process");
    vi.doUnmock("../src/lib/platform-paths");
    vi.resetModules();
  });

  /** Load utils with `where winget` printing `output` and the WindowsApps fallback at `canonical`. */
  async function loadWithWhere(output: string, canonical = "") {
    vi.resetModules();
    vi.doMock("child_process", async (importOriginal) => ({
      ...(await importOriginal<typeof import("child_process")>()),
      execSync: () => Buffer.from(output),
    }));
    vi.doMock("../src/lib/platform-paths", async (importOriginal) => ({
      ...(await importOriginal<typeof import("../src/lib/platform-paths")>()),
      windowsWingetPath: () => canonical,
    }));
    return import("../src/utils");
  }

  it("returns the first winget when `where` lists two (CRLF output)", async () => {
    // Regression: newlines were stripped before splitting, gluing both paths
    // into one that doesn't exist.
    const { getWingetPath } = await loadWithWhere(`${stable}\r\n${preview}\r\n`);
    await expect(getWingetPath()).resolves.toBe(stable);
  });

  it("skips a listed path that isn't on disk", async () => {
    const { getWingetPath } = await loadWithWhere(`${missing}\r\n${preview}\r\n`);
    await expect(getWingetPath()).resolves.toBe(preview);
  });

  it("falls back to the WindowsApps launcher when no listed path exists", async () => {
    const { getWingetPath } = await loadWithWhere(`${missing}\r\n`, stable);
    await expect(getWingetPath()).resolves.toBe(stable);
  });

  // winget is an app execution alias: Node can't stat it (existsSync is false),
  // only lstat it. A link to nothing behaves the same way.
  it("accepts winget's execution alias, from `where` and as the fallback", async (ctx) => {
    let alias = path.join(dir, "alias-winget.exe");
    try {
      fs.symlinkSync(path.join(dir, "nowhere.exe"), alias, "file");
    } catch {
      // Windows without the right to create symlinks: the real alias, when winget is installed.
      const apps = path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WindowsApps");
      if (!process.env.LOCALAPPDATA || !fs.readdirSync(apps).includes("winget.exe")) ctx.skip();
      alias = path.join(apps, "winget.exe");
    }
    expect(fs.existsSync(alias)).toBe(false);
    await expect((await loadWithWhere(`${alias}\r\n`)).getWingetPath()).resolves.toBe(alias);
    await expect((await loadWithWhere("", alias)).getWingetPath()).resolves.toBe(alias);
  });
});

describe("expandTilde", () => {
  it("expands a leading ~/ to the home directory", () => {
    expect(expandTilde("~/Downloads")).toBe(path.join(os.homedir(), "Downloads"));
  });

  it.runIf(process.platform === "win32")("uses Windows separators only, not C:\\Users\\me/Downloads", () => {
    expect(expandTilde("~/Downloads")).not.toContain("/");
    expect(expandTilde("~\\Downloads")).toBe(expandTilde("~/Downloads"));
  });

  it("expands a bare ~", () => {
    expect(expandTilde("~")).toBe(os.homedir());
  });

  it("leaves absolute paths unchanged", () => {
    expect(expandTilde("/Users/me/Movies")).toBe("/Users/me/Movies");
  });

  it("leaves ~user-style specs (no separator after tilde) untouched", () => {
    expect(expandTilde("~bob/x")).toBe("~bob/x");
  });
});

describe("getIdleTimeoutMs", () => {
  it("converts a valid seconds preference to milliseconds", () => {
    // The mocked preference is "120" -> 120000ms.
    expect(getIdleTimeoutMs()).toBe(120000);
  });
});

describe("formatFilesize", () => {
  it("returns '' for falsy sizes", () => {
    expect(formatFilesize(undefined, undefined)).toBe("");
    expect(formatFilesize(0)).toBe("");
  });

  it("formats across unit boundaries", () => {
    expect(formatFilesize(512)).toBe("512 B");
    expect(formatFilesize(1536)).toBe("1.50 KiB");
    expect(formatFilesize(1024 ** 2 * 2)).toBe("2.00 MiB");
    expect(formatFilesize(1024 ** 3 * 3)).toBe("3.00 GiB");
  });

  it("falls back to the approximate size when exact is absent", () => {
    expect(formatFilesize(undefined, 2048)).toBe("2.00 KiB");
  });
});

describe("getVideoFormats", () => {
  const fmt = (overrides: Partial<Format>): Format => ({
    format_id: "0",
    vcodec: "avc1",
    acodec: "mp4a",
    ext: "mp4",
    video_ext: "mp4",
    protocol: "https",
    resolution: "1920x1080",
    tbr: null,
    ...overrides,
  });
  const video: Video = {
    title: "t",
    duration: 1,
    formats: [
      fmt({ format_id: "worst", resolution: "640x360" }),
      fmt({ format_id: "audio", vcodec: "none", resolution: "audio only" }),
      fmt({ format_id: "best", resolution: "1920x1080" }),
    ],
  };

  it("returns video formats best-first (yt-dlp lists worst-first) and drops audio-only entries", () => {
    expect(getVideoFormats(video).map((f) => f.format_id)).toEqual(["best", "worst"]);
  });

  it("returns an empty list when there is no metadata", () => {
    expect(getVideoFormats(undefined)).toEqual([]);
  });
});
