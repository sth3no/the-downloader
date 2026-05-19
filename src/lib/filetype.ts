import { SourceType } from "../types.js";
import { ToolId } from "./tools.js";

/** What the user wants out of a URL — the Download form's second field. */
export type Filetype = "image" | "video" | "audio" | "transcript" | "website";

/** Filetype dropdown order (all five are always shown; detection only preselects). */
export const FILETYPES: Filetype[] = ["video", "audio", "image", "transcript", "website"];

/**
 * The Filetype detection preselects for a detected source. `audioPreferred` is the
 * `videoMediaType` preference: a video site defaults to audio when it is set.
 */
export function defaultFiletype(source: SourceType, audioPreferred: boolean): Filetype {
  switch (source) {
    case "gallery":
      return "image";
    case "spotify":
      return "audio";
    case "webpage":
      return "website";
    case "video":
    default:
      return audioPreferred ? "audio" : "video";
  }
}

/** The tool a (source, filetype) selection runs. */
export function resolveTool(source: SourceType, filetype: Filetype): ToolId {
  if (filetype === "website") return "monolith";
  if (filetype === "audio") return source === "spotify" ? "spotdl" : "yt-dlp";
  if (filetype === "image") return source === "gallery" ? "gallery-dl" : "yt-dlp";
  // filetype === "video" || filetype === "transcript"
  return "yt-dlp";
}

/** Every executable that must exist for a (source, filetype) selection. */
export function requiredTools(source: SourceType, filetype: Filetype): string[] {
  const tool = resolveTool(source, filetype);
  if (tool === "monolith") return ["monolith"];
  if (tool === "spotdl") return ["spotdl", "ffmpeg"];
  if (tool === "gallery-dl") return ["gallery-dl"];
  // tool === "yt-dlp" — transcript and thumbnail need only yt-dlp + ffmpeg.
  return filetype === "transcript" || filetype === "image"
    ? ["yt-dlp", "ffmpeg"]
    : ["yt-dlp", "ffmpeg", "ffprobe", "deno"];
}
