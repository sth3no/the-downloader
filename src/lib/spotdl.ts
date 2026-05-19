import { spawn } from "node:child_process";
import path from "node:path";

export type SpotdlDownloadOptions = {
  url: string;
  destination: string;
  format: string;
  ffmpegPath: string;
};

/** Build spotDL CLI args. Files are written as `<artists> - <title>.<ext>` in the destination. */
export function buildSpotdlArgs(o: SpotdlDownloadOptions): string[] {
  return [
    "download",
    o.url,
    "--output",
    path.join(o.destination, "{artists} - {title}.{output-ext}"),
    "--format",
    o.format,
    "--ffmpeg",
    o.ffmpegPath,
  ];
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
