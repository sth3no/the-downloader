import * as fs from "node:fs";
import * as path from "node:path";
import { execa } from "execa";
import { isMac, isWindows } from "./binary.js";

const RELEASE_API = "https://api.github.com/repos/spotDL/spotify-downloader/releases/latest";
const USER_AGENT = "the-downloader-raycast";

export type ReleaseAsset = { name: string; url: string };
export type SpotdlRelease = { version: string; assets: ReleaseAsset[] };

/**
 * Pick the spotDL release asset for a platform. spotDL publishes one binary per
 * platform: `spotdl-<version>-darwin` and `spotdl-<version>-win32.exe`. The bare
 * `spotDL` asset (a source file) is excluded by the `spotdl-` prefix check.
 */
export function resolveSpotdlAsset(platform: NodeJS.Platform, assets: ReleaseAsset[]): ReleaseAsset {
  const suffix = platform === "win32" ? "win32.exe" : platform === "darwin" ? "darwin" : null;
  if (!suffix) {
    throw new Error(`spotDL has no prebuilt binary for platform "${platform}"`);
  }
  const asset = assets.find((a) => a.name.startsWith("spotdl-") && a.name.endsWith(suffix));
  if (!asset) {
    throw new Error(`No spotDL release asset found for platform "${platform}"`);
  }
  return asset;
}

/** Fetch the latest spotDL release metadata from GitHub. */
export async function getLatestRelease(): Promise<SpotdlRelease> {
  const res = await fetch(RELEASE_API, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`GitHub release lookup failed (HTTP ${res.status})`);
  }
  const json = (await res.json()) as {
    tag_name: string;
    assets: { name: string; browser_download_url: string }[];
  };
  return {
    version: json.tag_name.replace(/^v/, ""),
    assets: json.assets.map((a) => ({ name: a.name, url: a.browser_download_url })),
  };
}

/**
 * Download the spotDL binary for this platform into `supportDir`. Writes to a
 * temp path and renames into place on success, so an interrupted download never
 * leaves a half-written binary at the resolved path. Returns the final path.
 */
export async function downloadSpotdl(supportDir: string): Promise<string> {
  const release = await getLatestRelease();
  const asset = resolveSpotdlAsset(process.platform, release.assets);

  const res = await fetch(asset.url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`spotDL download failed (HTTP ${res.status})`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());

  const finalPath = path.join(supportDir, isWindows ? "spotdl.exe" : "spotdl");
  const tempPath = `${finalPath}.download`;
  fs.mkdirSync(supportDir, { recursive: true });
  fs.writeFileSync(tempPath, bytes);
  fs.renameSync(tempPath, finalPath);

  if (!isWindows) {
    fs.chmodSync(finalPath, 0o755);
  }
  if (isMac) {
    // The release binary is unsigned; ad-hoc sign it so it runs on Apple Silicon.
    try {
      await execa("codesign", ["--sign", "-", "--force", finalPath]);
    } catch {
      // codesign unavailable or signing rejected — the binary may still run.
    }
  }
  return finalPath;
}

/** Read the installed spotDL version, e.g. "4.5.0". */
export async function getInstalledVersion(spotdlPath: string): Promise<string> {
  const { stdout } = await execa(spotdlPath, ["--version"]);
  const match = stdout.match(/\d+\.\d+\.\d+/);
  return match ? match[0] : stdout.trim();
}
