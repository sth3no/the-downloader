import { withCache } from "@raycast/utils";
import extractTranscript from "../transcript.js";
import { isValidUrl, normalizeUrl } from "../lib/url.js";
import { detectSource } from "../lib/detect.js";
import { filetypeGuidance } from "../lib/filetype.js";

type Input = {
  /**
   * The URL of the video to get transcript from.
   */
  url: string;
  /**
   * The language code for the transcript (e.g., 'en', 'es', 'fr').
   * Defaults to 'en' if not specified.
   */
  language?: string;
};

// Hoisted to module scope so the cache wrapper is created ONCE — recreating it
// per call (the previous behaviour) defeated caching entirely. `maxAge` bounds
// staleness so newly-added captions can surface, and `validate` keeps an empty
// transcript from being served from cache.
const cachedTranscript = withCache(extractTranscript, {
  maxAge: 24 * 60 * 60 * 1000,
  validate: (result) => result.transcript.trim().length > 0,
});

/** A BCP-47-ish language tag: `en`, `es`, `en-US`, `pt-BR`. */
const LANGUAGE_RE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

export default async function tool(input: Input) {
  // The interactive commands gate URLs through isValidUrl/normalizeUrl; this
  // model-driven entry point must too (defense in depth against a
  // prompt-injected value), mirroring download-video.ts.
  if (!isValidUrl(input.url)) {
    throw new Error("Invalid URL — provide an http(s) video URL.");
  }
  const url = normalizeUrl(input.url);

  // Transcripts only come from video sites (yt-dlp subtitles). A Spotify,
  // gallery, or arbitrary-page URL would be handed raw to yt-dlp and fail with
  // an unhelpful "Unsupported URL" dump — bail early with the same guidance the
  // Download command shows. The form never offers Transcript for these sources
  // (see supportedFiletypes); this model-driven path must enforce it itself.
  const source = detectSource(url);
  if (source !== "video") {
    throw new Error(`${filetypeGuidance(source)} Transcripts are only available for video sites.`);
  }

  const language = input.language && LANGUAGE_RE.test(input.language) ? input.language : "en";

  const { transcript } = await cachedTranscript(url, language);

  return transcript;
}
