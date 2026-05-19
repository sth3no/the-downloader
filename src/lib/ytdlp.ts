import { spawn } from "node:child_process";
import { execa } from "execa";
import { Video } from "../types.js";

/** Fetch yt-dlp metadata for a URL via --dump-json. `denoPath`, when given, points yt-dlp at its JS runtime. */
export async function fetchVideoInfo(
  ytdlPath: string,
  url: string,
  forceIpv4: boolean,
  denoPath?: string,
): Promise<Video> {
  const result = await execa(
    ytdlPath,
    [
      forceIpv4 ? "--force-ipv4" : "",
      denoPath ? "--js-runtimes" : "",
      denoPath ? `deno:${denoPath}` : "",
      "--no-playlist",
      "--dump-json",
      "--format-sort=resolution,ext,tbr",
      url,
    ].filter(Boolean),
    { env: { ...process.env, PYTHONUNBUFFERED: "1" } },
  );
  return JSON.parse(result.stdout) as Video;
}

export type VideoDownloadArgs = {
  url: string;
  format: string;
  outputTemplate: string;
  ffmpegPath: string;
  denoPath?: string;
};

/**
 * Build yt-dlp CLI args for a media download. `format` is a `"<download>#<recode>"`
 * pair: when the download half is `bestaudio` the audio is extracted to the recode
 * format, otherwise the video is downloaded and recoded to the recode container.
 */
export function buildVideoDownloadArgs(a: VideoDownloadArgs): string[] {
  const args = ["-o", a.outputTemplate, "--ffmpeg-location", a.ffmpegPath];
  if (a.denoPath) {
    args.push("--js-runtimes", `deno:${a.denoPath}`);
  }
  const [downloadFormat, recodeFormat] = a.format.split("#");
  if (downloadFormat === "bestaudio") {
    args.push("--extract-audio", "--audio-format", recodeFormat, "--audio-quality", "0");
  } else {
    args.push("--format", downloadFormat, "--recode-video", recodeFormat);
  }
  args.push("--progress", "--print", "after_move:filepath", a.url);
  return args;
}

export type VideoDownloadResult = { filePath: string };

/**
 * Run yt-dlp for a media download. `onProgress` receives the download percentage
 * as yt-dlp reports it. Resolves with the downloaded file path on a zero exit;
 * rejects with the stderr text on a non-zero exit. Progress and the
 * `after_move:filepath` line are read from stdout.
 */
export function runVideoDownload(
  binaryPath: string,
  options: VideoDownloadArgs,
  onProgress: (percent: number) => void,
): Promise<VideoDownloadResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, buildVideoDownloadArgs(options), {
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    let filePath = "";
    let stderr = "";
    child.stdout.on("data", (data: Buffer) => {
      for (const line of data.toString().split("\n")) {
        const progress = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(line);
        if (progress) {
          onProgress(Number(progress[1]));
        } else {
          const trimmed = line.trim();
          if (trimmed.startsWith("/") || /^[a-zA-Z]:\\/.test(trimmed)) {
            filePath = trimmed;
          }
        }
      }
    });
    child.stderr.on("data", (data: Buffer) => (stderr += data.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ filePath });
      } else {
        reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
      }
    });
  });
}

export type ThumbnailDownloadArgs = {
  url: string;
  outputTemplate: string;
};

/** Build yt-dlp CLI args to fetch only a URL's thumbnail image; the video itself is skipped. */
export function buildThumbnailArgs(a: ThumbnailDownloadArgs): string[] {
  return ["--write-thumbnail", "--skip-download", "--no-playlist", "-o", a.outputTemplate, a.url];
}

export type ThumbnailResult = { filePath: string };

/**
 * Run yt-dlp to save only a URL's thumbnail. Resolves with the saved image path,
 * parsed from yt-dlp's "Writing ... thumbnail ... to:" stdout line, on a zero exit;
 * rejects with the stderr text on a non-zero exit. If the path line is not matched
 * the promise still resolves, with an empty `filePath`.
 */
export function runThumbnailDownload(binaryPath: string, options: ThumbnailDownloadArgs): Promise<ThumbnailResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, buildThumbnailArgs(options), {
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    let filePath = "";
    let stderr = "";
    child.stdout.on("data", (data: Buffer) => {
      for (const line of data.toString().split("\n")) {
        const match = /Writing .*?thumbnail.*? to:\s*(.+)$/.exec(line.trim());
        if (match) filePath = match[1].trim();
      }
    });
    child.stderr.on("data", (data: Buffer) => (stderr += data.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ filePath });
      else reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}
