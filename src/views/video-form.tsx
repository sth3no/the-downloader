import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Icon,
  getPreferenceValues,
  open,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { useForm, usePromise } from "@raycast/utils";
import {
  DownloadOptions,
  getDenoPath,
  getffmpegPath,
  getffprobePath,
  getFormats,
  getFormatTitle,
  getFormatValue,
  getytdlPath,
  isMac,
  isValidHHMM,
  isValidUrl,
  parseHHMM,
  sanitizeVideoTitle,
} from "../utils.js";
import { fetchVideoInfo, buildVideoDownloadArgs } from "../lib/ytdlp.js";
import extractTranscript from "../transcript.js";
import Installer from "./installer.js";
import Updater from "./updater.js";

const { downloadPath, forceIpv4 } = getPreferenceValues<ExtensionPreferences>();

type VideoFormProps = {
  url: string;
  onUrlChange: (newUrl: string) => void;
};

export function VideoForm({ url, onUrlChange }: VideoFormProps) {
  const [error, setError] = useState(0);
  const [warning, setWarning] = useState("");

  const ytdlPath = useMemo(() => getytdlPath(), [error]);
  const ffmpegPath = useMemo(() => getffmpegPath(), [error]);
  const ffprobePath = useMemo(() => getffprobePath(), [error]);
  const denoPath = useMemo(() => getDenoPath(), [error]);

  const { handleSubmit, values, itemProps, setValidationError } = useForm<DownloadOptions>({
    initialValues: {
      url,
    },
    onSubmit: async (values) => {
      if (!values.format) return;
      if (values.format === "transcript") {
        const toast = await showToast({ style: Toast.Style.Animated, title: "Extracting Transcript" });
        try {
          const { transcript, title } = await extractTranscript(values.url);
          const filePath = path.join(downloadPath, `${title}.txt`);
          fs.writeFileSync(filePath, transcript, "utf-8");
          toast.style = Toast.Style.Success;
          toast.title = "Transcript Saved";
          toast.message = title;
          toast.primaryAction = { title: "Open", onAction: () => open(filePath) };
          toast.secondaryAction = { title: "Copy Transcript", onAction: () => Clipboard.copy(transcript) };
        } catch (error) {
          toast.style = Toast.Style.Failure;
          toast.title = "No Transcript Available";
          toast.message = error instanceof Error ? error.message : "Unknown error";
        }
        return;
      }
      const outputTemplate = path.join(downloadPath, `${video?.title || "video"} (%(id)s).%(ext)s`);
      const options = buildVideoDownloadArgs({
        url: values.url,
        format: values.format,
        outputTemplate,
        ffmpegPath,
        denoPath,
      });

      const toast = await showToast({
        title: "Downloading Video",
        style: Toast.Style.Animated,
        message: "0%",
      });

      const downloadProcess = spawn(ytdlPath, options, {
        env: { ...globalThis.process.env, PYTHONUNBUFFERED: "1" },
      });

      let filePath = "";

      downloadProcess.stdout.on("data", (data) => {
        const line = data.toString() as string;

        const progress = Number(/\[download\]\s+(\d+(\.\d+)?)%.*/.exec(line)?.[1]);
        if (progress) {
          const currentProgress = Number(toast.message?.replace("%", ""));

          if (progress < currentProgress) {
            toast.title = "Formatting Video";
          }
          toast.message = `${Math.floor(progress)}%`;
        }

        if (isMac ? line.startsWith("/") : line.match(/^[a-zA-Z]:\\/)) {
          filePath = line.trim();
        }
      });

      downloadProcess.stderr.on("data", (data) => {
        const line = data.toString();

        if (line.startsWith("WARNING:")) {
          setWarning(line);
        }

        if (line.startsWith("ERROR:")) {
          toast.title = "Download Failed";
          toast.style = Toast.Style.Failure;
        }
        toast.message = line;
      });

      downloadProcess.on("close", () => {
        if (toast.style === Toast.Style.Failure) {
          return;
        }

        toast.title = "Video Downloaded";
        toast.style = Toast.Style.Success;
        toast.message = video?.title;

        if (filePath) {
          toast.primaryAction = {
            title: isMac ? "Open in Finder" : "Open in Explorer",
            shortcut: { modifiers: ["cmd", "shift"], key: "o" },
            onAction: () => {
              open(path.dirname(filePath));
            },
          };
          toast.secondaryAction = {
            title: "Copy to Clipboard",
            shortcut: { modifiers: ["cmd", "shift"], key: "c" },
            onAction: () => {
              Clipboard.copy({ file: filePath });
              showHUD("Copied to Clipboard");
            },
          };
        }
      });
    },
    validation: {
      url: (value) => {
        if (!value) {
          return "URL is required";
        }
        if (!isValidUrl(value)) {
          return "Invalid URL";
        }
      },
      startTime: (value) => {
        if (value) {
          if (!isValidHHMM(value)) {
            return "Invalid time format";
          }
        }
      },
      endTime: (value) => {
        if (value) {
          if (!isValidHHMM(value)) {
            return "Invalid time format";
          }
          if (video && parseHHMM(value) > video?.duration) {
            return "End time is greater than video duration";
          }
        }
      },
    },
  });

  const { data: video, isLoading } = usePromise(
    async (url: string) => {
      if (!url) return;
      if (!isValidUrl(url)) return;

      const data = await fetchVideoInfo(ytdlPath, url, forceIpv4, fs.existsSync(denoPath) ? denoPath : undefined);

      return { ...data, title: sanitizeVideoTitle(data.title) };
    },
    [values.url],
    {
      onError(error) {
        showToast({
          style: Toast.Style.Failure,
          title: "Video not found with the provided URL",
          message: error.message,
          primaryAction: {
            title: "Copy to Clipboard",
            onAction: () => {
              Clipboard.copy(error.message);
            },
          },
        });
      },
    },
  );

  useEffect(() => {
    if (video) {
      if (video.live_status !== "not_live" && video.live_status !== undefined) {
        setValidationError("url", "Live streams are not supported");
      }
    }
  }, [video]);

  const missingExecutable = useMemo(() => {
    if (!fs.existsSync(ytdlPath)) {
      return "yt-dlp";
    }
    if (!fs.existsSync(ffmpegPath)) {
      return "ffmpeg";
    }
    if (!fs.existsSync(ffprobePath)) {
      return "ffprobe";
    }
    if (!fs.existsSync(denoPath)) {
      return "deno";
    }
    return null;
  }, [error]);

  const formats = useMemo(() => getFormats(video), [video]);

  if (missingExecutable) {
    return <Installer executable={missingExecutable} onRefresh={() => setError(error + 1)} />;
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.SubmitForm
              icon={Icon.Download}
              title="Download Video"
              onSubmit={(values) => {
                setWarning("");
                handleSubmit({ ...values, copyToClipboard: false } as DownloadOptions);
              }}
            />
          </ActionPanel.Section>
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
      <Form.Description title="Title" text={video?.title ?? "Video not found"} />
      <Form.TextField
        {...itemProps.url}
        autoFocus
        title="URL"
        placeholder="https://www.youtube.com/watch?v=ykaj0pS4A1A"
        onChange={(newValue) => {
          itemProps.url.onChange?.(newValue);
          onUrlChange(newValue);
        }}
      />
      {warning && <Form.Description text={warning} />}
      {video && (
        <Form.Dropdown {...itemProps.format} title="Format">
          {Object.entries(formats).map(([category, formats]) => (
            <Form.Dropdown.Section title={category} key={category}>
              {formats.map((format) => (
                <Form.Dropdown.Item
                  key={format.format_id}
                  value={getFormatValue(format)}
                  title={getFormatTitle(format)}
                />
              ))}
            </Form.Dropdown.Section>
          ))}
          <Form.Dropdown.Section title="Transcript">
            <Form.Dropdown.Item value="transcript" title="Transcript (.txt)" />
          </Form.Dropdown.Section>
        </Form.Dropdown>
      )}
    </Form>
  );
}
