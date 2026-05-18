import { useEffect, useState } from "react";
import { BrowserExtension, Clipboard, Form, getPreferenceValues, getSelectedText } from "@raycast/api";
import { detectSource } from "./lib/detect.js";
import { SourceType } from "./types.js";
import { isValidUrl } from "./utils.js";
import { VideoForm } from "./views/video-form.js";
import { GalleryForm } from "./views/gallery-form.js";

const { autoLoadUrlFromClipboard, autoLoadUrlFromSelectedText, enableBrowserExtensionSupport } =
  getPreferenceValues<ExtensionPreferences>();

export default function Command() {
  const [url, setUrl] = useState("");
  const [type, setType] = useState<SourceType>("video");
  const [typeTouched, setTypeTouched] = useState(false);
  const [autoLoadDone, setAutoLoadDone] = useState(false);

  useEffect(() => {
    (async () => {
      let loaded = "";
      if (autoLoadUrlFromClipboard) {
        const text = await Clipboard.readText();
        if (text && isValidUrl(text)) loaded = text;
      }
      if (!loaded && autoLoadUrlFromSelectedText) {
        try {
          const text = await getSelectedText();
          if (text && isValidUrl(text)) loaded = text;
        } catch {
          /* no selection */
        }
      }
      if (!loaded && enableBrowserExtensionSupport) {
        try {
          const tab = (await BrowserExtension.getTabs()).find((t) => t.active)?.url;
          if (tab && isValidUrl(tab)) loaded = tab;
        } catch {
          /* no browser extension */
        }
      }
      if (loaded) {
        setUrl(loaded);
        if (!typeTouched) setType(detectSource(loaded));
      }
      setAutoLoadDone(true);
    })();
  }, []);

  function handleUrlChange(next: string) {
    setUrl(next);
    if (!typeTouched && isValidUrl(next)) setType(detectSource(next));
  }

  function handleTypeChange(next: SourceType) {
    setTypeTouched(true);
    setType(next);
  }

  if (!autoLoadDone) return <Form isLoading />;

  return type === "gallery" ? (
    <GalleryForm url={url} typeValue={type} onTypeChange={handleTypeChange} onUrlChange={handleUrlChange} />
  ) : (
    <VideoForm url={url} onUrlChange={handleUrlChange} typeValue={type} onTypeChange={handleTypeChange} />
  );
}
