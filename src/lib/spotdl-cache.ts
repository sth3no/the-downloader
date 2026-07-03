import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";

/**
 * Locations Spotipy persists the OAuth token cache. spotDL writes to one of
 * these depending on the XDG config setup; we wipe both to be safe.
 */
function cachePaths(home: string): string[] {
  return [path.join(home, ".spotdl", ".spotipy"), path.join(home, ".config", "spotdl", ".spotipy")];
}

function fingerprintFile(supportDir: string): string {
  return path.join(supportDir, "spotdl-creds.fingerprint");
}

function fingerprintOf(clientId: string, clientSecret: string, userAuth: boolean): string {
  // Newline delimiter, not a space: credentials never contain newlines, so
  // ("a b", "c") and ("a", "b c") can't collide to the same fingerprint. (A
  // literal NUL works too but makes Git treat this source file as binary.)
  return crypto
    .createHash("sha256")
    .update([clientId, clientSecret, userAuth ? "u" : "c"].join("\n"))
    .digest("hex");
}

/**
 * Wipe spotDL's cached OAuth token when the active credential set changed since
 * the previous run. Spotipy keys its cache by filename only — it has no idea
 * the cached token belongs to a different Client ID — so a stale token is
 * silently reused and the new credentials look broken (spotDL upstream #2606).
 * Detect a change via a sha256 fingerprint stored in `supportDir` and unlink
 * the cache file(s) when it differs. The fingerprint is only advanced once every
 * cache file is actually gone (unlinked, or already absent — ENOENT). If a real
 * error leaves a stale cache in place (EPERM/EBUSY, a locked file), the
 * fingerprint write is skipped so the next run retries the wipe instead of
 * silently masking the stale-token bug forever. A failed fingerprint *write* is
 * still harmless — we simply re-clear next run.
 */
export function invalidateSpotipyCacheIfStale(
  supportDir: string,
  clientId: string | undefined,
  clientSecret: string | undefined,
  userAuth: boolean,
  home: string = os.homedir(),
): void {
  if (!clientId || !clientSecret) return;
  const current = fingerprintOf(clientId, clientSecret, userAuth);
  const fpFile = fingerprintFile(supportDir);
  let previous = "";
  try {
    previous = fs.readFileSync(fpFile, "utf8").trim();
  } catch {
    /* no prior fingerprint — treat as changed */
  }
  if (previous === current) return;
  let allCleared = true;
  for (const cachePath of cachePaths(home)) {
    try {
      fs.unlinkSync(cachePath);
    } catch (error) {
      // ENOENT means the file was already absent — nothing stale left behind, so
      // that counts as cleared. Any other error (EPERM/EBUSY, a locked file)
      // means a stale token may still be on disk; keep going through the rest of
      // the paths but don't advance the fingerprint, so the next run retries.
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") allCleared = false;
    }
  }
  // Skip the fingerprint write when a wipe genuinely failed, so a stale cache is
  // retried next run rather than being recorded as handled.
  if (!allCleared) return;
  try {
    fs.mkdirSync(supportDir, { recursive: true });
    fs.writeFileSync(fpFile, current);
  } catch {
    /* persistence failed — we'll re-clear next run, harmless */
  }
}
