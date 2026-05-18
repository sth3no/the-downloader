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

/** Run spotDL; onProgress fires as tracks complete. Resolves with the track count or rejects with stderr. */
export function runSpotdlDownload(
  binaryPath: string,
  options: SpotdlDownloadOptions,
  onProgress: (p: SpotdlProgress) => void,
): Promise<SpotdlProgress> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, buildSpotdlArgs(options));
    let tracks = 0;
    let stderr = "";
    child.stdout.on("data", (data: Buffer) => {
      // spotDL prints one "Downloaded ..." line per completed track.
      const completed = data
        .toString()
        .split("\n")
        .filter((line) => line.includes("Downloaded")).length;
      if (completed > 0) {
        tracks += completed;
        onProgress({ tracks });
      }
    });
    child.stderr.on("data", (data: Buffer) => (stderr += data.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ tracks });
      else reject(new Error(stderr.trim() || `spotdl exited with code ${code}`));
    });
  });
}
