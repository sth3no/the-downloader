import { useEffect, useState } from "react";
import { BrowserExtension, Clipboard, Form, getPreferenceValues, getSelectedText, LaunchProps } from "@raycast/api";
import { detectSource } from "./lib/detect.js";
import { SourceType } from "./types.js";
import { isValidUrl } from "./utils.js";
import { VideoForm } from "./views/video-form.js";
import { GalleryForm } from "./views/gallery-form.js";
import { SpotifyForm } from "./views/spotify-form.js";

const { autoLoadUrlFromClipboard, autoLoadUrlFromSelectedText, enableBrowserExtensionSupport } =
  getPreferenceValues<ExtensionPreferences>();

export default function Command(props: LaunchProps) {
  const [url, setUrl] = useState("");
  const [type, setType] = useState<SourceType>("video");
  const [autoLoadDone, setAutoLoadDone] = useState(false);

  useEffect(() => {
    (async () => {
      let loaded = "";

      // A URL handed off from the Fast Download command takes priority.
      const contextUrl = (props.launchContext as { url?: string } | undefined)?.url;
      if (contextUrl && isValidUrl(contextUrl)) loaded = contextUrl;

      if (!loaded && autoLoadUrlFromClipboard) {
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
        setType(detectSource(loaded));
      }
      setAutoLoadDone(true);
    })();
  }, []);

  function handleUrlChange(next: string) {
    setUrl(next);
    if (isValidUrl(next)) setType(detectSource(next));
  }

  if (!autoLoadDone) return <Form isLoading />;

  if (type === "gallery") {
    return <GalleryForm url={url} onUrlChange={handleUrlChange} />;
  }
  if (type === "spotify") {
    return <SpotifyForm url={url} onUrlChange={handleUrlChange} />;
  }
  return <VideoForm url={url} onUrlChange={handleUrlChange} />;
}
