import { execa } from "execa";
import { Video } from "../types.js";
import { DEFAULT_IDLE_MS, runWithWatchdog } from "./run.js";

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
  /** Idle-watchdog window in ms. Defaults to DEFAULT_IDLE_MS if omitted. */
  idleMs?: number;
};

/**
 * Sentinel prefix wrapped around the final filepath so it can be picked out of
 * yt-dlp's mixed stdout deterministically. Without the tag we relied on "first
 * char is `/`", which matched intermediate post-processor lines like
 * `[ExtractAudio] Destination: /…` and could overwrite the real after_move
 * path. The tag is opaque enough that no extractor's own output prints it.
 */
const FILEPATH_TAG = "THE-DOWNLOADER-FILEPATH:";
const FILEPATH_LINE_RE = new RegExp(`^${FILEPATH_TAG}(.+)$`);

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
  args.push("--progress", "--print", `after_move:${FILEPATH_TAG}%(filepath)s`, a.url);
  return args;
}

export type VideoDownloadResult = { filePath: string };

/**
 * Run yt-dlp for a media download. `onProgress` receives the download percentage
 * as yt-dlp reports it. Resolves with the downloaded file path on a zero exit;
 * rejects with the stderr text on a non-zero exit, or with a watchdog error if
 * yt-dlp stalls. Progress and the `after_move:filepath` line are read from stdout.
 */
export async function runVideoDownload(
  binaryPath: string,
  options: VideoDownloadArgs,
  onProgress: (percent: number) => void,
): Promise<VideoDownloadResult> {
  let filePath = "";
  const handleStdout = (chunk: string) => {
    for (const line of chunk.split("\n")) {
      const progress = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(line);
      if (progress) {
        onProgress(Number(progress[1]));
        continue;
      }
      const tagged = FILEPATH_LINE_RE.exec(line.trim());
      if (tagged) {
        filePath = tagged[1].trim();
      }
    }
  };
  const { code, stderr } = await runWithWatchdog(binaryPath, buildVideoDownloadArgs(options), {
    idleMs: options.idleMs ?? DEFAULT_IDLE_MS,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
    onStdoutChunk: handleStdout,
  });
  if (code === 0) return { filePath };
  throw new Error(stderr.trim() || `yt-dlp exited with code ${code}`);
}

export type ThumbnailDownloadArgs = {
  url: string;
  outputTemplate: string;
  /** Idle-watchdog window in ms. Defaults to DEFAULT_IDLE_MS if omitted. */
  idleMs?: number;
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
export async function runThumbnailDownload(
  binaryPath: string,
  options: ThumbnailDownloadArgs,
): Promise<ThumbnailResult> {
  let filePath = "";
  const handleStdout = (chunk: string) => {
    for (const line of chunk.split("\n")) {
      const match = /Writing .*?thumbnail.*? to:\s*(.+)$/.exec(line.trim());
      if (match) filePath = match[1].trim();
    }
  };
  const { code, stderr } = await runWithWatchdog(binaryPath, buildThumbnailArgs(options), {
    idleMs: options.idleMs ?? DEFAULT_IDLE_MS,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
    onStdoutChunk: handleStdout,
  });
  if (code === 0) return { filePath };
  throw new Error(stderr.trim() || `yt-dlp exited with code ${code}`);
}
