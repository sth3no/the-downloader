import { useMemo, useState } from "react";
import fs from "node:fs";
import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  Toast,
  openExtensionPreferences,
  showToast,
} from "@raycast/api";
import { execa } from "execa";
import {
  downloadPath,
  getGalleryDlPath,
  getWingetPath,
  getffmpegPath,
  getffprobePath,
  getytdlPath,
  homebrewPath,
  isMac,
} from "../utils.js";

type ToolStatus = { name: string; path: string; installed: boolean };

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [isInstalling, setIsInstalling] = useState(false);

  const tools = useMemo<ToolStatus[]>(
    () =>
      [
        { name: "yt-dlp", path: getytdlPath() },
        { name: "ffmpeg", path: getffmpegPath() },
        { name: "ffprobe", path: getffprobePath() },
        { name: "gallery-dl", path: getGalleryDlPath() },
      ].map((t) => ({ ...t, installed: fs.existsSync(t.path) })),
    [refreshKey],
  );

  const missing = tools.filter((t) => !t.installed);

  const checklist = tools
    .map((t) => `- ${t.installed ? "✅" : "❌"} ${t.name} — ${t.installed ? "installed" : "not found"}`)
    .join("\n");

  const markdown = `# Welcome to The Downloader

Download video, audio, image galleries, and YouTube transcripts — all from one command. Webpage saving arrives in a later release.

## Required tools

The Downloader drives the yt-dlp and gallery-dl command-line tools:

${checklist}

## You're set

Downloads are saved to \`${downloadPath}\`. Quality and format defaults live in extension settings — open them to adjust, or keep the defaults.

Choose **Finish Setup** when you're ready.
`;

  async function installMissing() {
    if (isInstalling || missing.length === 0) return;
    setIsInstalling(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "Installing tools…" });
    try {
      if (isMac) {
        await execa(homebrewPath, ["install", ...missing.map((t) => t.name)]);
      } else {
        const wingetPath = await getWingetPath();
        await execa(wingetPath, [
          "install",
          "--accept-source-agreements",
          "--accept-package-agreements",
          "--id=yt-dlp.yt-dlp",
          "-e",
        ]);
      }
      toast.style = Toast.Style.Success;
      toast.title = "Tools installed";
      setRefreshKey((k) => k + 1);
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Installation failed";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    } finally {
      setIsInstalling(false);
    }
  }

  return (
    <Detail
      isLoading={isInstalling}
      navigationTitle="Setup"
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action title="Finish Setup" icon={Icon.Check} onAction={onComplete} />
          {missing.length > 0 && (
            <Action title="Install Missing Tools" icon={Icon.Download} onAction={installMissing} />
          )}
          <Action title="Open Settings" icon={Icon.Gear} onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    />
  );
}
