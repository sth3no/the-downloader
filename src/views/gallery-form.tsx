import { useState } from "react";
import fs from "node:fs";
import { Action, ActionPanel, Form, Icon, Toast, getPreferenceValues, open, showToast } from "@raycast/api";
import { getGalleryDlPath } from "../utils.js";
import { runGalleryDownload } from "../lib/gallerydl.js";
import Installer from "./installer.js";
import { SourceType } from "../types.js";

type GalleryFormProps = {
  url: string;
  typeValue: SourceType;
  onTypeChange: (t: SourceType) => void;
  onUrlChange: (newUrl: string) => void;
};

export function GalleryForm({ url, typeValue, onTypeChange, onUrlChange }: GalleryFormProps) {
  const [refresh, setRefresh] = useState(0);
  const { downloadPath, cookiesFromBrowser } = getPreferenceValues<ExtensionPreferences>();
  const galleryDlPath = getGalleryDlPath();

  if (!fs.existsSync(galleryDlPath)) {
    return <Installer executable="gallery-dl" onRefresh={() => setRefresh(refresh + 1)} />;
  }

  async function onSubmit(values: { url: string; destination: string[] }) {
    const destination = values.destination[0] ?? downloadPath;
    const toast = await showToast({ style: Toast.Style.Animated, title: "Downloading Gallery", message: "0 files" });
    try {
      const { files } = await runGalleryDownload(
        galleryDlPath,
        { url: values.url, destination, cookiesFromBrowser: cookiesFromBrowser || undefined },
        (p) => {
          toast.message = `${p.files} files`;
        },
      );
      toast.style = Toast.Style.Success;
      toast.title = "Gallery Downloaded";
      toast.message = `${files} files`;
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
          <Action.SubmitForm icon={Icon.Download} title="Download Gallery" onSubmit={onSubmit} />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="sourceType" title="Type" value={typeValue} onChange={(v) => onTypeChange(v as SourceType)}>
        <Form.Dropdown.Item value="video" title="Video / Audio" />
        <Form.Dropdown.Item value="gallery" title="Gallery" />
      </Form.Dropdown>
      <Form.TextField
        id="url"
        title="URL"
        defaultValue={url}
        placeholder="https://imgur.com/a/..."
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
