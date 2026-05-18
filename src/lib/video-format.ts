/**
 * Map a generic video-quality token (the `videoQuality` preference) to a
 * yt-dlp `-f` format selector string. Any unrecognised token resolves to the
 * uncapped best-quality selector.
 */
export function videoFormatSelector(quality: string): string {
  if (quality === "smallest") {
    return "worstvideo+worstaudio/worst";
  }
  if (quality === "1080" || quality === "720" || quality === "480") {
    return `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]`;
  }
  return "bestvideo+bestaudio/best";
}

/**
 * Compose the `format` string consumed by `buildVideoDownloadArgs` from the
 * Section 1 download defaults. Audio downloads become `bestaudio#<audioFormat>`;
 * video downloads become `<quality selector>#<container>`. The `#` separates the
 * download-format selector from the recode/extract target.
 */
export function composeVideoFormat(o: {
  mediaType: "video" | "audio";
  quality: string;
  container: string;
  audioFormat: string;
}): string {
  if (o.mediaType === "audio") {
    return `bestaudio#${o.audioFormat}`;
  }
  return `${videoFormatSelector(o.quality)}#${o.container}`;
}
