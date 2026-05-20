import { spawn } from "node:child_process";
import path from "node:path";

export type SpotdlDownloadOptions = {
  url: string;
  destination: string;
  format: string;
  ffmpegPath: string;
  /** Spotify API credentials. Both must be present and non-empty for either to be passed. */
  clientId?: string;
  clientSecret?: string;
};

/**
 * Build spotDL CLI args. Files are written as `<artists> - <title>.<ext>` in
 * the destination. When both Spotify API credentials are provided, they are
 * appended so spotDL uses the user's developer app instead of the anonymous
 * librespot session — the latter regularly fails with "Could not get session
 * auth tokens" against Spotify's metadata endpoints.
 */
export function buildSpotdlArgs(o: SpotdlDownloadOptions): string[] {
  const args = [
    "download",
    o.url,
    "--output",
    path.join(o.destination, "{artists} - {title}.{output-ext}"),
    "--format",
    o.format,
    "--ffmpeg",
    o.ffmpegPath,
  ];
  const id = o.clientId?.trim();
  const secret = o.clientSecret?.trim();
  if (id && secret) {
    args.push("--client-id", id, "--client-secret", secret);
  }
  return args;
}

export type SpotdlProgress = { tracks: number };

/**
 * Run spotDL; onProgress fires as tracks complete. Resolves with the track count
 * or rejects with the failure output. spotDL is Python+Rich-based and routinely
 * prints tracebacks/errors to stdout rather than stderr, so stdout is captured
 * and used as the error message when stderr is empty.
 */
export function runSpotdlDownload(
  binaryPath: string,
  options: SpotdlDownloadOptions,
  onProgress: (p: SpotdlProgress) => void,
): Promise<SpotdlProgress> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, buildSpotdlArgs(options));
    let tracks = 0;
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      // spotDL prints one "Downloaded ..." line per completed track.
      const completed = text.split("\n").filter((line) => line.includes("Downloaded")).length;
      if (completed > 0) {
        tracks += completed;
        onProgress({ tracks });
      }
    });
    child.stderr.on("data", (data: Buffer) => (stderr += data.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ tracks });
      else reject(new Error(stderr.trim() || stdout.trim() || `spotdl exited with code ${code}`));
    });
  });
}
