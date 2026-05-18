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
