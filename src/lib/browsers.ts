import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type PlatformPaths = { mac?: string; win?: string; linux?: string };

/** Pick the path key matching `platform`; returns "" if absent. */
function pickPath(paths: PlatformPaths, platform: NodeJS.Platform): string {
  if (platform === "darwin") return paths.mac ?? "";
  if (platform === "win32") return paths.win ?? "";
  return paths.linux ?? "";
}

type ResolveContext = { platform: NodeJS.Platform; home: string };
const defaultCtx = (): ResolveContext => ({ platform: process.platform, home: os.homedir() });

/**
 * Find the most-recently-used Firefox-format profile in the platform-appropriate
 * base directory. A profile qualifies only if its `cookies.sqlite` exists, so an
 * empty/never-launched profile doesn't shadow a real one. Returns "" if no
 * profile qualifies or the directory can't be read.
 */
export function findFirefoxProfile(paths: PlatformPaths, ctx: ResolveContext = defaultCtx()): string {
  const rel = pickPath(paths, ctx.platform);
  if (!rel) return "";
  const base = path.join(ctx.home, rel);
  let best: { full: string; mtime: number } | undefined;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return "";
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(base, entry.name);
    try {
      if (!fs.existsSync(path.join(full, "cookies.sqlite"))) continue;
      const mtime = fs.statSync(full).mtimeMs;
      if (!best || mtime > best.mtime) best = { full, mtime };
    } catch {
      /* skip a profile we can't read or stat */
    }
  }
  return best?.full ?? "";
}
