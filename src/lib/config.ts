import { getPreferenceValues } from "@raycast/api";

export type VideoMediaType = "video" | "audio";

/** Per-content-type download defaults, read from extension preferences. */
export type DownloaderConfig = {
  videoMediaType: VideoMediaType;
  videoQuality: string;
  videoContainer: string;
  audioFormat: string;
  webpageSaveMode: string;
};

/** Read the per-content-type download defaults from extension preferences. */
export function getConfig(): DownloaderConfig {
  const prefs = getPreferenceValues<ExtensionPreferences>();
  return {
    videoMediaType: prefs.videoMediaType as VideoMediaType,
    videoQuality: prefs.videoQuality,
    videoContainer: prefs.videoContainer,
    audioFormat: prefs.audioFormat,
    webpageSaveMode: prefs.webpageSaveMode,
  };
}

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
