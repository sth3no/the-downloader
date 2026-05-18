import { execa } from "execa";
import { Video } from "../types.js";
import { MP3_FORMAT_ID } from "../utils.js";

/** Fetch yt-dlp metadata for a URL via --dump-json. */
export async function fetchVideoInfo(ytdlPath: string, url: string, forceIpv4: boolean): Promise<Video> {
  const result = await execa(
    ytdlPath,
    [forceIpv4 ? "--force-ipv4" : "", "--no-playlist", "--dump-json", "--format-sort=resolution,ext,tbr", url].filter(
      Boolean,
    ),
    { env: { ...process.env, PYTHONUNBUFFERED: "1" } },
  );
  return JSON.parse(result.stdout) as Video;
}

export type VideoDownloadArgs = {
  url: string;
  format: string;
  outputTemplate: string;
  ffmpegPath: string;
};

/** Build yt-dlp CLI args for a media download. */
export function buildVideoDownloadArgs(a: VideoDownloadArgs): string[] {
  const args = ["-o", a.outputTemplate, "--ffmpeg-location", a.ffmpegPath];
  const [downloadFormat, recodeFormat] = a.format.split("#");
  if (a.format === MP3_FORMAT_ID) {
    args.push("--extract-audio", "--audio-format", "mp3", "--audio-quality", "0");
  } else {
    args.push("--format", downloadFormat, "--recode-video", recodeFormat);
  }
  args.push("--progress", "--print", "after_move:filepath", a.url);
  return args;
}
