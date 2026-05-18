import { useState } from "react";
import fs from "node:fs";
import { Action, ActionPanel, Form, Icon, Toast, getPreferenceValues, open, showToast } from "@raycast/api";
import { getSpotdlPath, getffmpegPath } from "../utils.js";
import { runSpotdlDownload } from "../lib/spotdl.js";
import Installer from "./installer.js";
import { SourceType } from "../types.js";

type SpotifyFormProps = {
  url: string;
  typeValue: SourceType;
  onTypeChange: (t: SourceType) => void;
  onUrlChange: (newUrl: string) => void;
};

export function SpotifyForm({ url, typeValue, onTypeChange, onUrlChange }: SpotifyFormProps) {
  const [refresh, setRefresh] = useState(0);
  const { downloadPath, spotifyAudioFormat } = getPreferenceValues<ExtensionPreferences>();
  const spotdlPath = getSpotdlPath();
  const ffmpegPath = getffmpegPath();

  if (!fs.existsSync(spotdlPath)) {
    return <Installer executable="spotdl" onRefresh={() => setRefresh(refresh + 1)} />;
  }
  if (!fs.existsSync(ffmpegPath)) {
    return <Installer executable="ffmpeg" onRefresh={() => setRefresh(refresh + 1)} />;
  }

  async function onSubmit(values: { url: string; destination: string[] }) {
    const destination = values.destination[0] ?? downloadPath;
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Downloading from Spotify",
      message: "0 tracks",
    });
    try {
      const { tracks } = await runSpotdlDownload(
        spotdlPath,
        { url: values.url, destination, format: spotifyAudioFormat, ffmpegPath },
        (p) => {
          toast.message = `${p.tracks} tracks`;
        },
      );
      toast.style = Toast.Style.Success;
      toast.title = "Spotify Download Complete";
      toast.message = `${tracks} tracks`;
      toast.primaryAction = { title: "Open Folder", onAction: () => open(destination) };
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Download Failed";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm icon={Icon.Download} title="Download from Spotify" onSubmit={onSubmit} />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="sourceType" title="Type" value={typeValue} onChange={(v) => onTypeChange(v as SourceType)}>
        <Form.Dropdown.Item value="video" title="Video / Audio" />
        <Form.Dropdown.Item value="gallery" title="Gallery" />
        <Form.Dropdown.Item value="spotify" title="Spotify" />
      </Form.Dropdown>
      <Form.TextField
        id="url"
        title="URL"
        defaultValue={url}
        placeholder="https://open.spotify.com/playlist/..."
        onChange={onUrlChange}
      />
      <Form.FilePicker
        id="destination"
        title="Destination"
        allowMultipleSelection={false}
        canChooseDirectories
        canChooseFiles={false}
        defaultValue={[downloadPath]}
      />
    </Form>
  );
}
