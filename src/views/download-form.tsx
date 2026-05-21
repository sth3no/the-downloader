import { useEffect, useMemo, useState } from "react";
import fs from "node:fs";
import path from "node:path";
import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Icon,
  Toast,
  environment,
  getPreferenceValues,
  open,
  openExtensionPreferences,
  showHUD,
  showInFinder,
  showToast,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { detectSource } from "../lib/detect.js";
import { Filetype, FILETYPES, defaultFiletype, requiredTools, resolveTool } from "../lib/filetype.js";
import { composeVideoFormat } from "../lib/video-format.js";
import { fetchVideoInfo, runThumbnailDownload, runVideoDownload } from "../lib/ytdlp.js";
import { isLoginRequiredError, runGalleryDownload } from "../lib/gallerydl.js";
import { resolveBrowser } from "../lib/browsers.js";
import { runSpotdlDownload, SpotdlDownloadError } from "../lib/spotdl.js";
import { runMonolithSave, webpageFilename } from "../lib/monolith.js";
import extractTranscript from "../transcript.js";
import {
  downloadPath,
  formatHHMM,
  getDenoPath,
  getFormats,
  getFormatTitle,
  getFormatValue,
  getGalleryDlPath,
  getMonolithPath,
  getSpotdlPath,
  getffmpegPath,
  getffprobePath,
  getytdlPath,
  isValidUrl,
  sanitizeVideoTitle,
} from "../utils.js";
import Installer from "./installer.js";
import Updater from "./updater.js";

const prefs = getPreferenceValues<ExtensionPreferences>();

/** Required-tool name → its filesystem-path resolver. */
const TOOL_PATH: Record<string, () => string> = {
  "yt-dlp": getytdlPath,
  ffmpeg: getffmpegPath,
  ffprobe: getffprobePath,
  deno: getDenoPath,
  "gallery-dl": getGalleryDlPath,
  spotdl: getSpotdlPath,
  monolith: getMonolithPath,
};

const FILETYPE_TITLE: Record<Filetype, string> = {
  video: "Video",
  audio: "Audio",
  image: "Image",
  transcript: "Transcript",
  website: "Website",
};

const FILETYPE_ICON: Record<Filetype, Icon> = {
  video: Icon.Video,
  audio: Icon.Music,
  image: Icon.Image,
  transcript: Icon.Document,
  website: Icon.Globe,
};

const SPOTDL_SETUP_GUIDE_URL = "https://github.com/sth3no/the-downloader/blob/main/SPOTIFY.md";

/** Turn a rejected runner into a red, copyable failure toast. */
function failToast(toast: Toast, error: unknown) {
  if (error instanceof SpotdlDownloadError) {
    const partial =
      error.tracks > 0 ? `Downloaded ${error.tracks} track${error.tracks === 1 ? "" : "s"} before failure. ` : "";
    toast.style = Toast.Style.Failure;
    toast.title = error.summary.title;
    toast.message = partial + error.summary.message;
    toast.primaryAction = { title: "Copy Full Error", onAction: () => Clipboard.copy(error.rawOutput) };
    if (error.summary.action === "open-preferences") {
      toast.secondaryAction = { title: "Open Extension Preferences", onAction: () => openExtensionPreferences() };
    } else if (error.summary.action === "open-setup-guide") {
      toast.secondaryAction = { title: "Open Setup Guide", onAction: () => open(SPOTDL_SETUP_GUIDE_URL) };
    }
    return;
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  toast.style = Toast.Style.Failure;
  toast.title = "Download Failed";
  toast.message = message;
  toast.primaryAction = { title: "Copy Error", onAction: () => Clipboard.copy(message) };
}

type DownloadFormProps = { initialUrl: string };

export function DownloadForm({ initialUrl }: DownloadFormProps) {
  const audioPreferred = prefs.videoMediaType === "audio";

  const [url, setUrl] = useState(initialUrl);
  const [filetype, setFiletype] = useState<Filetype>(() =>
    isValidUrl(initialUrl) ? defaultFiletype(detectSource(initialUrl), audioPreferred) : "video",
  );
  const [filetypeTouched, setFiletypeTouched] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const validUrl = isValidUrl(url);
  const source = useMemo(() => detectSource(url), [url]);
  const ytdlpBound = resolveTool(source, filetype) === "yt-dlp";

  // Re-detect the default Filetype as the URL changes — until the user overrides it.
  useEffect(() => {
    if (!filetypeTouched && validUrl) {
      setFiletype(defaultFiletype(detectSource(url), audioPreferred));
    }
  }, [url, filetypeTouched, validUrl, audioPreferred]);

  // The required tools must all exist; otherwise the form is replaced by the Installer.
  const missingTool = useMemo(
    () => (validUrl ? requiredTools(source, filetype).find((name) => !fs.existsSync(TOOL_PATH[name]())) : undefined),
    [source, filetype, validUrl, refresh],
  );

  // yt-dlp metadata — fetched only for a yt-dlp-bound selection with its tools present.
  const shouldFetchMeta = ytdlpBound && validUrl && !missingTool;
  const { data: video, isLoading: metaLoading } = usePromise(
    async (u: string, fetchIt: boolean) => {
      if (!fetchIt) return undefined;
      const denoPath = getDenoPath();
      const data = await fetchVideoInfo(
        getytdlPath(),
        u,
        prefs.forceIpv4,
        fs.existsSync(denoPath) ? denoPath : undefined,
      );
      return { ...data, title: sanitizeVideoTitle(data.title) };
    },
    [url, shouldFetchMeta],
    { onError: () => undefined },
  );

  const liveStream = !!video && video.live_status !== undefined && video.live_status !== "not_live";

  if (missingTool) {
    return <Installer executable={missingTool} onRefresh={() => setRefresh((r) => r + 1)} />;
  }

  // The adaptive status line.
  let statusLabel = "Status";
  let statusText = "Paste a link to download.";
  if (validUrl) {
    if (ytdlpBound && video) {
      statusLabel = "Title";
      statusText = video.duration ? `${video.title} · ${formatHHMM(video.duration)}` : video.title;
    } else if (ytdlpBound && metaLoading) {
      statusText = "Fetching details…";
    } else if (ytdlpBound) {
      statusText = "Ready to download.";
    } else if (source === "gallery") {
      statusText = "Image gallery — gallery-dl will fetch every image.";
    } else if (source === "spotify") {
      statusText = "Spotify link — spotDL will fetch the audio.";
    } else {
      statusText = "Not a known media site — it will be saved as a webpage. Change Filetype to force another tool.";
    }
  }

  const urlError =
    url && !validUrl
      ? "Enter a valid URL"
      : liveStream && (filetype === "video" || filetype === "audio")
        ? "Live streams are not supported"
        : undefined;

  async function handleSubmit(values: Form.Values) {
    const submitUrl = String(values.url ?? "").trim();
    if (!isValidUrl(submitUrl)) {
      await showToast({ style: Toast.Style.Failure, title: "Enter a valid URL" });
      return;
    }
    const ft = values.filetype as Filetype;
    const src = detectSource(submitUrl);
    const folder = (values.destination as string[] | undefined)?.[0] ?? downloadPath;

    if (liveStream && (ft === "video" || ft === "audio")) {
      await showToast({ style: Toast.Style.Failure, title: "Live streams are not supported" });
      return;
    }

    if (ft === "website") {
      const toast = await showToast({ style: Toast.Style.Animated, title: "Saving Webpage" });
      try {
        const { filePath } = await runMonolithSave(getMonolithPath(), {
          url: submitUrl,
          outputPath: path.join(folder, webpageFilename(submitUrl)),
          noJavaScript: values.saveMode === "lightweight",
        });
        toast.style = Toast.Style.Success;
        toast.title = "Webpage Saved";
        toast.message = path.basename(filePath);
        toast.primaryAction = { title: "Open Folder", onAction: () => showInFinder(filePath) };
        toast.secondaryAction = { title: "Open File", onAction: () => open(filePath) };
      } catch (error) {
        failToast(toast, error);
      }
      return;
    }

    if (ft === "transcript") {
      const toast = await showToast({ style: Toast.Style.Animated, title: "Extracting Transcript" });
      try {
        const { transcript, title } = await extractTranscript(submitUrl);
        const filePath = path.join(folder, `${title}.txt`);
        fs.writeFileSync(filePath, transcript, "utf-8");
        toast.style = Toast.Style.Success;
        toast.title = "Transcript Saved";
        toast.message = `${title}.txt`;
        toast.primaryAction = { title: "Open", onAction: () => open(filePath) };
        toast.secondaryAction = { title: "Copy Transcript", onAction: () => Clipboard.copy(transcript) };
      } catch (error) {
        failToast(toast, error);
      }
      return;
    }

    if (ft === "image" && src === "gallery") {
      const browser = resolveBrowser(prefs.cookiesFromBrowser, prefs.cookiesFromBrowserCustom);
      const toast = await showToast({ style: Toast.Style.Animated, title: "Downloading Gallery", message: "0 files" });

      if (browser.warning) {
        toast.style = Toast.Style.Failure;
        toast.title = "Cookies from Browser";
        toast.message = browser.warning;
        toast.primaryAction = { title: "Open Extension Preferences", onAction: () => openExtensionPreferences() };
        return;
      }

      try {
        const { files } = await runGalleryDownload(
          getGalleryDlPath(),
          { url: submitUrl, destination: folder, cookiesFromBrowser: browser.spec || undefined },
          (p) => {
            toast.message = `${p.files} files`;
          },
        );
        toast.style = Toast.Style.Success;
        toast.title = "Gallery Downloaded";
        toast.message = `${files} files`;
        toast.primaryAction = { title: "Open Folder", onAction: () => open(folder) };
      } catch (error) {
        if (isLoginRequiredError(error)) {
          toast.style = Toast.Style.Failure;
          toast.title = "Login Required";
          toast.message = browser.label
            ? `Sign in to the site in ${browser.label}, or change the browser in preferences.`
            : "Set Gallery: Cookies from Browser in preferences to use your browser's session.";
          toast.primaryAction = { title: "Open Extension Preferences", onAction: () => openExtensionPreferences() };
        } else {
          failToast(toast, error);
        }
      }
      return;
    }

    if (ft === "image") {
      const toast = await showToast({ style: Toast.Style.Animated, title: "Downloading Thumbnail" });
      try {
        const { filePath } = await runThumbnailDownload(getytdlPath(), {
          url: submitUrl,
          outputTemplate: path.join(folder, "%(title)s (%(id)s).%(ext)s"),
        });
        toast.style = Toast.Style.Success;
        toast.title = "Thumbnail Saved";
        toast.message = filePath ? path.basename(filePath) : undefined;
        toast.primaryAction = {
          title: "Open Folder",
          onAction: () => (filePath ? showInFinder(filePath) : open(folder)),
        };
        if (filePath) {
          toast.secondaryAction = { title: "Open File", onAction: () => open(filePath) };
        }
      } catch (error) {
        failToast(toast, error);
      }
      return;
    }

    if (ft === "audio" && src === "spotify") {
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: "Downloading from Spotify",
        message: "0 tracks",
      });

      // Read credentials fresh on submit so prefs edited while the form is open
      // are picked up without re-launching the command.
      const livePrefs = getPreferenceValues<ExtensionPreferences>();
      const clientId = livePrefs.spotifyClientId?.trim();
      const clientSecret = livePrefs.spotifyClientSecret?.trim();
      const userAuth = livePrefs.spotifyUserAuth;
      if (!clientId || !clientSecret) {
        toast.style = Toast.Style.Failure;
        toast.title = "Spotify credentials missing";
        toast.message =
          "Open extension preferences and set Spotify: Client ID and Client Secret. The setup guide explains how to get them.";
        toast.primaryAction = { title: "Open Extension Preferences", onAction: () => openExtensionPreferences() };
        toast.secondaryAction = {
          title: "Open Setup Guide",
          onAction: () => open("https://github.com/sth3no/the-downloader/blob/main/SPOTIFY.md"),
        };
        return;
      }

      try {
        const { tracks } = await runSpotdlDownload(
          getSpotdlPath(),
          {
            url: submitUrl,
            destination: folder,
            format: prefs.spotifyAudioFormat,
            ffmpegPath: getffmpegPath(),
            clientId,
            clientSecret,
            userAuth,
            supportDir: environment.supportPath,
          },
          (p) => {
            toast.message = `${p.tracks} tracks`;
          },
        );
        toast.style = Toast.Style.Success;
        toast.title = "Download Complete";
        toast.message = `${tracks} tracks`;
        toast.primaryAction = { title: "Open Folder", onAction: () => open(folder) };
      } catch (error) {
        failToast(toast, error);
      }
      return;
    }

    // video, or audio on a non-Spotify site → yt-dlp.
    const format =
      ft === "audio"
        ? composeVideoFormat({
            mediaType: "audio",
            quality: "best",
            container: "mp4",
            audioFormat: String(values.audioFmt ?? prefs.audioFormat),
          })
        : values.exactFormat && values.exactFormat !== "auto"
          ? String(values.exactFormat)
          : composeVideoFormat({
              mediaType: "video",
              quality: String(values.quality ?? prefs.videoQuality),
              container: String(values.container ?? prefs.videoContainer),
              audioFormat: prefs.audioFormat,
            });
    const denoPath = getDenoPath();
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: ft === "audio" ? "Downloading Audio" : "Downloading Video",
      message: "0%",
    });
    try {
      const { filePath } = await runVideoDownload(
        getytdlPath(),
        {
          url: submitUrl,
          format,
          outputTemplate: path.join(folder, "%(title)s (%(id)s).%(ext)s"),
          ffmpegPath: getffmpegPath(),
          denoPath: fs.existsSync(denoPath) ? denoPath : undefined,
        },
        (percent) => {
          toast.message = `${Math.floor(percent)}%`;
        },
      );
      toast.style = Toast.Style.Success;
      toast.title = "Downloaded";
      toast.message = filePath ? path.basename(filePath) : undefined;
      toast.primaryAction = {
        title: "Open Folder",
        onAction: () => (filePath ? showInFinder(filePath) : open(folder)),
      };
      if (filePath) {
        toast.secondaryAction = {
          title: "Copy to Clipboard",
          onAction: () => {
            Clipboard.copy({ file: filePath });
            showHUD("Copied to Clipboard");
          },
        };
      }
    } catch (error) {
      failToast(toast, error);
    }
  }

  return (
    <Form
      isLoading={metaLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm icon={Icon.Download} title="Download" onSubmit={handleSubmit} />
          <ActionPanel.Section>
            <Action.Push icon={Icon.Hammer} title="Update Libraries" target={<Updater />} />
            <Action.OpenInBrowser
              icon={Icon.Info}
              title="About This Extension"
              url="https://github.com/sth3no/the-downloader/blob/main/ABOUT.md"
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
      searchBarAccessory={
        <Form.LinkAccessory
          text="Supported Sites"
          target="https://github.com/sth3no/the-downloader/blob/main/SUPPORTED_SITES.md"
        />
      }
    >
      <Form.Description title={statusLabel} text={statusText} />
      <Form.TextField
        id="url"
        title="URL"
        autoFocus
        value={url}
        error={urlError}
        onChange={setUrl}
        placeholder="https://www.youtube.com/watch?v=ykaj0pS4A1A"
      />
      {validUrl && (
        <>
          <Form.Dropdown
            id="filetype"
            title="Filetype"
            value={filetype}
            onChange={(next) => {
              setFiletype(next as Filetype);
              setFiletypeTouched(true);
            }}
          >
            {FILETYPES.map((ft) => (
              <Form.Dropdown.Item key={ft} value={ft} title={FILETYPE_TITLE[ft]} icon={FILETYPE_ICON[ft]} />
            ))}
          </Form.Dropdown>

          {filetype === "video" && (
            <>
              <Form.Dropdown id="quality" title="Quality" defaultValue={prefs.videoQuality}>
                <Form.Dropdown.Item value="best" title="Best Available" />
                <Form.Dropdown.Item value="1080" title="1080p" />
                <Form.Dropdown.Item value="720" title="720p" />
                <Form.Dropdown.Item value="480" title="480p" />
                <Form.Dropdown.Item value="smallest" title="Smallest File" />
              </Form.Dropdown>
              <Form.Dropdown id="container" title="Container" defaultValue={prefs.videoContainer}>
                <Form.Dropdown.Item value="mp4" title="MP4" />
                <Form.Dropdown.Item value="mkv" title="MKV" />
                <Form.Dropdown.Item value="webm" title="WebM" />
              </Form.Dropdown>
              {prefs.exactFormatSelection && (
                <Form.Dropdown id="exactFormat" title="Exact Format" defaultValue="auto">
                  <Form.Dropdown.Item value="auto" title="Auto — use Quality + Container above" />
                  {video &&
                    getFormats(video).Video.map((f) => (
                      <Form.Dropdown.Item key={f.format_id} value={getFormatValue(f)} title={getFormatTitle(f)} />
                    ))}
                </Form.Dropdown>
              )}
            </>
          )}

          {filetype === "audio" && (
            <Form.Dropdown
              id="audioFmt"
              key={`audioFmt-${source}`}
              title="Format"
              defaultValue={source === "spotify" ? prefs.spotifyAudioFormat : prefs.audioFormat}
            >
              <Form.Dropdown.Item value="mp3" title="MP3" />
              <Form.Dropdown.Item value="m4a" title="M4A" />
              <Form.Dropdown.Item value="opus" title="Opus" />
              {source === "spotify" && <Form.Dropdown.Item value="flac" title="FLAC" />}
            </Form.Dropdown>
          )}

          {filetype === "website" && (
            <Form.Dropdown id="saveMode" title="Save Mode" defaultValue={prefs.webpageSaveMode}>
              <Form.Dropdown.Item value="complete" title="Complete (embed everything)" />
              <Form.Dropdown.Item value="lightweight" title="Lightweight (no JavaScript)" />
            </Form.Dropdown>
          )}

          <Form.FilePicker
            id="destination"
            title="Folder"
            allowMultipleSelection={false}
            canChooseDirectories
            canChooseFiles={false}
            defaultValue={[downloadPath]}
          />
        </>
      )}
    </Form>
  );
}
