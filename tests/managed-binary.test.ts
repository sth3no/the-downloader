import { describe, it, expect } from "vitest";
import { resolveSpotdlAsset } from "../src/lib/managed-binary";

const assets = [
  { name: "spotDL", url: "u0" },
  { name: "spotdl-4.5.0-darwin", url: "u1" },
  { name: "spotdl-4.5.0-linux", url: "u2" },
  { name: "spotdl-4.5.0-win32.exe", url: "u3" },
];

describe("resolveSpotdlAsset", () => {
  it("picks the darwin binary on macOS", () => {
    expect(resolveSpotdlAsset("darwin", assets).name).toBe("spotdl-4.5.0-darwin");
  });

  it("picks the win32 binary on Windows", () => {
    expect(resolveSpotdlAsset("win32", assets).name).toBe("spotdl-4.5.0-win32.exe");
  });

  it("never picks the bare 'spotDL' source asset", () => {
    expect(resolveSpotdlAsset("darwin", assets).name).not.toBe("spotDL");
  });

  it("throws when no asset matches the platform", () => {
    expect(() => resolveSpotdlAsset("win32", [{ name: "spotdl-4.5.0-darwin", url: "u1" }])).toThrow();
  });
});
