import { useState } from "react";
import fs from "node:fs";
import path from "node:path";
import { Action, ActionPanel, Form, Icon, Toast, getPreferenceValues, open, showToast } from "@raycast/api";
import { getMonolithPath } from "../utils.js";
import { runMonolithSave, webpageFilename } from "../lib/monolith.js";
import Installer from "./installer.js";

type WebpageFormProps = {
  url: string;
  onUrlChange: (newUrl: string) => void;
};

export function WebpageForm({ url, onUrlChange }: WebpageFormProps) {
  const [refresh, setRefresh] = useState(0);
  const { downloadPath, webpageSaveMode } = getPreferenceValues<ExtensionPreferences>();
  const monolithPath = getMonolithPath();

  if (!fs.existsSync(monolithPath)) {
    return <Installer executable="monolith" onRefresh={() => setRefresh(refresh + 1)} />;
  }

  async function onSubmit(values: { url: string; saveMode: string; destination: string[] }) {
    const destination = values.destination[0] ?? downloadPath;
    const outputPath = path.join(destination, webpageFilename(values.url));
    const toast = await showToast({ style: Toast.Style.Animated, title: "Saving Webpage" });
    try {
      const { filePath } = await runMonolithSave(monolithPath, {
        url: values.url,
        outputPath,
        noJavaScript: values.saveMode === "lightweight",
      });
      toast.style = Toast.Style.Success;
      toast.title = "Webpage Saved";
      toast.message = path.basename(filePath);
      toast.primaryAction = { title: "Open Folder", onAction: () => open(destination) };
      toast.secondaryAction = { title: "Open File", onAction: () => open(filePath) };
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Save Failed";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm icon={Icon.Download} title="Save Webpage" onSubmit={onSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Save as Webpage"
        text="This site isn't a video, gallery, or music source. It will be saved as a single self-contained .html file using monolith."
      />
      <Form.TextField
        id="url"
        title="URL"
        defaultValue={url}
        placeholder="https://example.com/article"
        onChange={onUrlChange}
      />
      <Form.Dropdown id="saveMode" title="Save Mode" defaultValue={webpageSaveMode}>
        <Form.Dropdown.Item value="complete" title="Complete (embed everything)" />
        <Form.Dropdown.Item value="lightweight" title="Lightweight (no JavaScript)" />
      </Form.Dropdown>
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
