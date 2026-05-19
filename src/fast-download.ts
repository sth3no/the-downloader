import fs from "node:fs";
import path from "node:path";
import {
  Clipboard,
  LaunchProps,
  LaunchType,
  Toast,
  getPreferenceValues,
  launchCommand,
  open,
  showToast,
} from "@raycast/api";
import { detectSource } from "./lib/detect.js";
import { getConfig } from "./lib/config.js";
import { composeVideoFormat } from "./lib/video-format.js";
import { runVideoDownload } from "./lib/ytdlp.js";
import { runGalleryDownload } from "./lib/gallerydl.js";
import { runSpotdlDownload } from "./lib/spotdl.js";
import { runMonolithSave, webpageFilename } from "./lib/monolith.js";
import {
  getDenoPath,
  getGalleryDlPath,
  getMonolithPath,
  getSpotdlPath,
  getffmpegPath,
  getffprobePath,
  getytdlPath,
  isValidUrl,
} from "./utils.js";

/** A no-view command cannot render the Installer view, so a missing tool is
 *  handed off to the main Download command, which can. */
async function handOff(tool: string, url: string): Promise<void> {
  await showToast({
    style: Toast.Style.Failure,
    title: `${tool} Is Not Installed`,
    message: "Open The Downloader to install it, then download again.",
    primaryAction: {
      title: "Set Up The Downloader",
      onAction: async () => {
        try {
          await launchCommand({ name: "index", type: LaunchType.UserInitiated, context: { url } });
        } catch {
          /* the Download command is the primary command and is always enabled */
        }
      },
    },
  });
}

/** Turn a thrown value into a human-readable message. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export default async function FastDownload(props: LaunchProps<{ arguments: Arguments.FastDownload }>): Promise<void> {
  const { url } = props.arguments;

  if (!isValidUrl(url)) {
    await showToast({ style: Toast.Style.Failure, title: "Invalid URL", message: url });
    return;
  }

  const { downloadPath, cookiesFromBrowser, spotifyAudioFormat, webpageSaveMode } =
    getPreferenceValues<ExtensionPreferences>();
  const type = detectSource(url);

  if (type === "gallery") {
    const galleryDlPath = getGalleryDlPath();
    if (!fs.existsSync(galleryDlPath)) return handOff("gallery-dl", url);

    const toast = await showToast({ style: Toast.Style.Animated, title: "Downloading Gallery", message: "0 files" });
    try {
      const { files } = await runGalleryDownload(
        galleryDlPath,
        { url, destination: downloadPath, cookiesFromBrowser: cookiesFromBrowser || undefined },
        (p) => {
          toast.message = `${p.files} files`;
        },
      );
      toast.style = Toast.Style.Success;
      toast.title = "Downloaded";
      toast.message = `${files} files`;
      toast.primaryAction = { title: "Open Folder", onAction: () => open(downloadPath) };
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Download Failed";
      toast.message = errorMessage(error);
      toast.primaryAction = { title: "Copy Error", onAction: () => Clipboard.copy(errorMessage(error)) };
    }
    return;
  }

  if (type === "spotify") {
    const spotdlPath = getSpotdlPath();
    const ffmpegPath = getffmpegPath();
    if (!fs.existsSync(spotdlPath)) return handOff("spotdl", url);
    if (!fs.existsSync(ffmpegPath)) return handOff("ffmpeg", url);

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Downloading from Spotify",
      message: "0 tracks",
    });
    try {
      const { tracks } = await runSpotdlDownload(
        spotdlPath,
        { url, destination: downloadPath, format: spotifyAudioFormat, ffmpegPath },
        (p) => {
          toast.message = `${p.tracks} tracks`;
        },
      );
      toast.style = Toast.Style.Success;
      toast.title = "Downloaded";
      toast.message = `${tracks} tracks`;
      toast.primaryAction = { title: "Open Folder", onAction: () => open(downloadPath) };
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Download Failed";
      toast.message = errorMessage(error);
      toast.primaryAction = { title: "Copy Error", onAction: () => Clipboard.copy(errorMessage(error)) };
    }
    return;
  }

  if (type === "webpage") {
    const monolithPath = getMonolithPath();
    if (!fs.existsSync(monolithPath)) return handOff("monolith", url);

    const outputPath = path.join(downloadPath, webpageFilename(url));
    const toast = await showToast({ style: Toast.Style.Animated, title: "Saving Webpage" });
    try {
      const { filePath } = await runMonolithSave(monolithPath, {
        url,
        outputPath,
        noJavaScript: webpageSaveMode === "lightweight",
      });
      toast.style = Toast.Style.Success;
      toast.title = "Saved";
      toast.message = path.basename(filePath);
      toast.primaryAction = { title: "Open Folder", onAction: () => open(downloadPath) };
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Save Failed";
      toast.message = errorMessage(error);
      toast.primaryAction = { title: "Copy Error", onAction: () => Clipboard.copy(errorMessage(error)) };
    }
    return;
  }

  // video — the default route (detectSource routes unknown hosts to "webpage", handled above)
  const ytdlPath = getytdlPath();
  const ffmpegPath = getffmpegPath();
  const ffprobePath = getffprobePath();
  const denoPath = getDenoPath();
  if (!fs.existsSync(ytdlPath)) return handOff("yt-dlp", url);
  if (!fs.existsSync(ffmpegPath)) return handOff("ffmpeg", url);
  if (!fs.existsSync(ffprobePath)) return handOff("ffprobe", url);
  if (!fs.existsSync(denoPath)) return handOff("deno", url);

  const config = getConfig();
  const format = composeVideoFormat({
    mediaType: config.videoMediaType,
    quality: config.videoQuality,
    container: config.videoContainer,
    audioFormat: config.audioFormat,
  });
  const outputTemplate = path.join(downloadPath, "%(title)s (%(id)s).%(ext)s");

  const toast = await showToast({ style: Toast.Style.Animated, title: "Downloading Video", message: "0%" });
  try {
    const { filePath } = await runVideoDownload(
      ytdlPath,
      { url, format, outputTemplate, ffmpegPath, denoPath },
      (percent) => {
        toast.message = `${Math.floor(percent)}%`;
      },
    );
    toast.style = Toast.Style.Success;
    toast.title = "Downloaded";
    toast.message = filePath ? path.basename(filePath) : "Video";
    toast.primaryAction = {
      title: "Open Folder",
      onAction: () => open(filePath ? path.dirname(filePath) : downloadPath),
    };
    if (filePath) {
      toast.secondaryAction = { title: "Copy to Clipboard", onAction: () => Clipboard.copy({ file: filePath }) };
    }
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Download Failed";
    toast.message = errorMessage(error);
    toast.primaryAction = { title: "Copy Error", onAction: () => Clipboard.copy(errorMessage(error)) };
  }
}
