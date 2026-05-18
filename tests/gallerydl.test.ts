import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { spawn } from "node:child_process";
import { buildGalleryArgs, runGalleryDownload } from "../src/lib/gallerydl.js";

function fakeChild() {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

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

describe("runGalleryDownload", () => {
  it("resolves with { files: 2 } and calls onProgress when two file lines are emitted on stdout", async () => {
    const child = fakeChild();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(child);

    const onProgress = vi.fn();
    const promise = runGalleryDownload(
      "/usr/local/bin/gallery-dl",
      { url: "https://imgur.com/a/x", destination: "/tmp" },
      onProgress,
    );

    child.stdout.emit("data", Buffer.from("file1.jpg\nfile2.jpg\n"));
    child.emit("close", 0);

    await expect(promise).resolves.toEqual({ files: 2 });
    expect(onProgress).toHaveBeenCalled();
  });

  it("rejects with the stderr text when the child exits with a non-zero code", async () => {
    const child = fakeChild();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(child);

    const promise = runGalleryDownload(
      "/usr/local/bin/gallery-dl",
      { url: "https://imgur.com/a/bad", destination: "/tmp" },
      vi.fn(),
    );

    child.stderr.emit("data", Buffer.from("unsupported URL"));
    child.emit("close", 1);

    await expect(promise).rejects.toThrow("unsupported URL");
  });
});
