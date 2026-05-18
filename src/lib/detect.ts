import { SourceType } from "../types.js";

const GALLERY_DOMAINS = [
  "reddit.com", "redd.it", "imgur.com", "pixiv.net", "deviantart.com",
  "flickr.com", "danbooru.donmai.us", "gelbooru.com", "artstation.com",
  "pinterest.com", "tumblr.com", "instagram.com",
];

function hostnameOf(url: string): string {
  try {
    const withProtocol = url.startsWith("http") ? url : `https://${url}`;
    return new URL(withProtocol).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function matches(host: string, domains: string[]): boolean {
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * Detect whether a URL is a video source (yt-dlp) or an image gallery
 * (gallery-dl). Unknown domains default to "video" — yt-dlp's generic
 * extractor covers the broadest range of sites.
 */
export function detectSource(url: string): SourceType {
  const host = hostnameOf(url);
  if (!host) return "video";
  if (matches(host, GALLERY_DOMAINS)) return "gallery";
  return "video";
}
