import { useEffect, useState } from "react";
import { BrowserExtension, Clipboard, Detail, getPreferenceValues, getSelectedText, LocalStorage } from "@raycast/api";
import { detectSource } from "./lib/detect.js";
import { SourceType } from "./types.js";
import { isValidUrl } from "./utils.js";
import { VideoForm } from "./views/video-form.js";
import { GalleryForm } from "./views/gallery-form.js";
import { Onboarding } from "./views/onboarding.js";

const { autoLoadUrlFromClipboard, autoLoadUrlFromSelectedText, enableBrowserExtensionSupport } =
  getPreferenceValues<ExtensionPreferences>();

const ONBOARDING_KEY = "hasCompletedOnboarding";

export default function Command() {
  const [url, setUrl] = useState("");
  const [type, setType] = useState<SourceType>("video");
  const [typeTouched, setTypeTouched] = useState(false);
  const [startupDone, setStartupDone] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const onboarded = await LocalStorage.getItem<string>(ONBOARDING_KEY);
        if (!onboarded) setShowOnboarding(true);
      } catch {
        /* storage unavailable — skip onboarding rather than block the user */
      }

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
      setStartupDone(true);
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

  async function handleOnboardingComplete() {
    try {
      await LocalStorage.setItem(ONBOARDING_KEY, "true");
    } catch {
      /* storage write failed — proceed anyway so the user is not stuck */
    }
    setShowOnboarding(false);
  }

  if (!startupDone) return <Detail isLoading />;

  if (showOnboarding) return <Onboarding onComplete={handleOnboardingComplete} />;

  return type === "gallery" ? (
    <GalleryForm url={url} typeValue={type} onTypeChange={handleTypeChange} onUrlChange={handleUrlChange} />
  ) : (
    <VideoForm url={url} onUrlChange={handleUrlChange} typeValue={type} onTypeChange={handleTypeChange} />
  );
}
