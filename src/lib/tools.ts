import { isWindows } from "./binary.js";

export type InstallMethod = "homebrew" | "winget" | "managed-binary";
export type ToolId = "yt-dlp" | "ffmpeg" | "gallery-dl" | "spotdl";

export type ToolSpec = {
  id: ToolId;
  installMethod: InstallMethod;
};

const packageManagerMethod: InstallMethod = isWindows ? "winget" : "homebrew";

/** Every external CLI the extension installs or updates as a unit, and how each is obtained on this platform. */
export const TOOLS: Record<ToolId, ToolSpec> = {
  "yt-dlp": { id: "yt-dlp", installMethod: packageManagerMethod },
  ffmpeg: { id: "ffmpeg", installMethod: packageManagerMethod },
  "gallery-dl": { id: "gallery-dl", installMethod: packageManagerMethod },
  spotdl: { id: "spotdl", installMethod: "managed-binary" },
};

/** Homebrew formula names — the tools the macOS auto-installer passes to `brew install`. */
export const HOMEBREW_FORMULAE: string[] = Object.values(TOOLS)
  .filter((tool) => tool.installMethod === "homebrew")
  .map((tool) => tool.id);

/** True when `executable` is an extension-managed binary (downloaded, not installed via a package manager). */
export function isManagedTool(executable: string): boolean {
  return (TOOLS as Record<string, ToolSpec | undefined>)[executable]?.installMethod === "managed-binary";
}
