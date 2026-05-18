import * as fs from "node:fs";
import { execFileSync } from "node:child_process";

export const isWindows = process.platform === "win32";
export const isMac = process.platform === "darwin";

function whichWindows(name: string): string {
  try {
    return execFileSync("where", [name]).toString().split("\n")[0].replace(/[\r\n]/g, "").trim();
  } catch {
    return "";
  }
}

/**
 * Resolve the path to a CLI binary: the user-configured preference path if
 * it exists on disk, otherwise the platform default location.
 */
export function resolveBinary(name: string, preferencePath?: string): string {
  const pref = isWindows ? preferencePath?.replace(/[\r\n]/g, "").trim() : preferencePath;
  if (pref && fs.existsSync(pref)) return pref;
  if (isMac) return `/opt/homebrew/bin/${name}`;
  if (isWindows) return whichWindows(name);
  return `/usr/bin/${name}`;
}
