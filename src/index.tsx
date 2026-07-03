import { useEffect, useState } from "react";
import { BrowserExtension, Clipboard, Form, getPreferenceValues, getSelectedText, LaunchProps } from "@raycast/api";
import { isValidUrl } from "./utils.js";
import { DownloadForm } from "./views/download-form.js";

const { autoLoadUrlFromClipboard, autoLoadUrlFromSelectedText, enableBrowserExtensionSupport } =
  getPreferenceValues<ExtensionPreferences>();

export default function Command(props: LaunchProps) {
  const [loadedUrl, setLoadedUrl] = useState("");
  const [startupDone, setStartupDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        let loaded = "";

        // A URL handed off from the Fast Download command takes priority.
        const contextUrl = (props.launchContext as { url?: string } | undefined)?.url;
        if (contextUrl && isValidUrl(contextUrl)) loaded = contextUrl;

        if (!loaded && autoLoadUrlFromClipboard) {
          // Clipboard.readText can reject (denied clipboard access, empty
          // pasteboard on some hosts). Guard it like the other probes so a
          // rejection can't blow past the `finally` below and strand the
          // command on <Form isLoading /> forever.
          try {
            const text = await Clipboard.readText();
            if (text && isValidUrl(text)) loaded = text;
          } catch {
            /* clipboard unavailable */
          }
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
        if (loaded) setLoadedUrl(loaded);
      } finally {
        // Always leave startup — any unexpected rejection above must still let
        // the form render instead of hanging on the loading spinner.
        setStartupDone(true);
      }
    })();
  }, []);

  if (!startupDone) return <Form isLoading />;

  return <DownloadForm initialUrl={loadedUrl} />;
}
