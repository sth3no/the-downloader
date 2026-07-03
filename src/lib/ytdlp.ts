import { execa, ExecaError } from "execa";
import { Video } from "../types.js";
import { AbortError, DEFAULT_IDLE_MS, runWithWatchdog } from "./run.js";

/**
 * Pull the first JSON object out of yt-dlp's stdout. yt-dlp can emit `[debug]`
 * or `[warning]` lines on stdout before the JSON when its config has tracing
 * on, so a naive `JSON.parse(stdout)` would throw a SyntaxError and the form
 * silently treats the URL as unknown. Scan for the first line that starts with
 * `{` and parse from there.
 */
export function extractDumpJson(stdout: string): Video {
  const lines = stdout.split("\n");
  const jsonStart = lines.findIndex((line) => line.trimStart().startsWith("{"));
  if (jsonStart === -1) {
    throw new Error("yt-dlp produced no JSON metadata. Try updating yt-dlp via the Update Libraries action.");
  }
  const json = lines.slice(jsonStart).join("\n");
  return JSON.parse(json) as Video;
}

/**
 * Fetch yt-dlp metadata for a URL via --dump-json. `denoPath`, when given,
 * points yt-dlp at its JS runtime. `opts.signal` cancels the fetch (so a stale
 * metadata probe is killed when the URL changes or the form unmounts).
 *
 * `opts.timeoutMs` caps total runtime so a wedged extractor can't hang forever;
 * it defaults to DEFAULT_IDLE_MS (not 0/unbounded) so a caller that omits it
 * still can't hang indefinitely. `stdin: "ignore"` is required because execa v9
 * defaults stdin to a pipe — yt-dlp could otherwise block on an interactive
 * prompt (2FA, cookie passphrase) during the probe, which never resolves.
 *
 * On cancel or timeout execa rejects with an ExecaError whose `message` is the
 * entire command line. Rethrow the codebase's AbortError when the user pressed
 * Stop (`isCanceled`) so the form paints a neutral "Cancelled", and a friendly
 * idle-style message on `timedOut`, rather than dumping the raw command line
 * into a red "Download Failed" toast.
 */
export async function fetchVideoInfo(
  ytdlPath: string,
  url: string,
  forceIpv4: boolean,
  denoPath?: string,
  opts?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<Video> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_IDLE_MS;
  try {
    const result = await execa(
      ytdlPath,
      [
        forceIpv4 ? "--force-ipv4" : "",
        denoPath ? "--js-runtimes" : "",
        denoPath ? `deno:${denoPath}` : "",
        "--no-playlist",
        "--no-warnings",
        "--quiet",
        "--dump-json",
        "--format-sort=resolution,ext,tbr",
        url,
      ].filter(Boolean),
      {
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
        cancelSignal: opts?.signal,
        timeout: timeoutMs,
        stdin: "ignore",
      },
    );
    return extractDumpJson(result.stdout);
  } catch (error) {
    if (error instanceof ExecaError && error.isCanceled) throw new AbortError();
    if (error instanceof ExecaError && error.timedOut) {
      const seconds = Math.round(timeoutMs / 1000);
      throw new Error(
        `yt-dlp produced no metadata within ${seconds}s and was killed. This usually means it is stuck on an auth or network step; retry, or raise the Network: Idle Timeout preference.`,
      );
    }
    throw error;
  }
}

/**
 * True when yt-dlp metadata marks the URL as a live (or upcoming/post-live)
 * stream. `live_status` is absent for extractors that never set it and an
 * explicit `null` for some that do — both mean "not live", so only a concrete
 * status other than "not_live" counts. (A `!== undefined` check alone treated
 * `null` as live and blocked ordinary downloads on those extractors.)
 */
export function isLiveStream(video: Video): boolean {
  return video.live_status !== undefined && video.live_status !== null && video.live_status !== "not_live";
}

export type VideoDownloadArgs = {
  url: string;
  format: string;
  /** Destination directory, passed via `-P`. yt-dlp does NOT %-expand this, so a folder with a literal `%` is safe here (unlike the `-o` template). */
  destination: string;
  /** Filename template relative to `destination`, passed via `-o` (this IS %-expanded, e.g. `%(title)s (%(id)s).%(ext)s`). */
  outputTemplate: string;
  ffmpegPath: string;
  denoPath?: string;
  /** Emit `--force-ipv4`. The metadata probe already forces IPv4; the download must match or it can stall on a broken IPv6 route the probe avoided. */
  forceIpv4?: boolean;
  /** Idle-watchdog window in ms. Defaults to DEFAULT_IDLE_MS if omitted. */
  idleMs?: number;
  /** Aborting cancels the download mid-flight (used by the form's Stop action and unmount cleanup). */
  abortSignal?: AbortSignal;
};

/**
 * Sentinel prefix wrapped around the final filepath so it can be picked out of
 * yt-dlp's mixed stdout deterministically. Without the tag we relied on "first
 * char is `/`", which matched intermediate post-processor lines like
 * `[ExtractAudio] Destination: /…` and could overwrite the real after_move
 * path. The tag is opaque enough that no extractor's own output prints it.
 */
const FILEPATH_TAG = "THE-DOWNLOADER-FILEPATH:";
const FILEPATH_LINE_RE = new RegExp(`^${FILEPATH_TAG}(.+)$`);

/**
 * yt-dlp prints this when `--match-filters "!is_live"` rejects the URL (a live
 * stream): `[download] <title> does not pass filter (!is_live), skipping ..`.
 * We detect it to turn an otherwise-silent "exit 0 with no downloaded file" into
 * a clear live-stream error instead of an apparent success.
 */
const MATCH_FILTER_SKIP_RE = /does not pass filter|skipping/i;

/**
 * Build yt-dlp CLI args for a media download. `format` is a `"<download>#<target>"`
 * pair: when the download half is `bestaudio` the audio is extracted to the target
 * audio format, otherwise the video streams are downloaded and **remuxed** into the
 * target container with `--merge-output-format`.
 *
 * Remuxing copies the streams (fast, lossless). The old `--recode-video` forced a
 * full re-encode that ran ffmpeg silently for minutes, tripping the idle watchdog
 * mid-encode and leaving a half-written file behind. The format selector already
 * steers toward container-compatible codecs (see `videoFormatSelector`), so a copy
 * is all that's needed.
 *
 * The destination is passed as `-P <destination>` and the filename as a RELATIVE
 * `-o <outputTemplate>`. yt-dlp %-expands the `-o` template but NOT the `-P`
 * path, so a folder containing a literal `%` (e.g. "100% mixes") is safe —
 * joining the folder straight into `-o` made yt-dlp read the `%` as a field spec
 * and fail with a cryptic template error.
 *
 * `--match-filters "!is_live"` is a yt-dlp-level backstop against live streams. A
 * live URL records indefinitely from the live edge, so output never stops, the
 * idle watchdog never fires, and the progress regex never matches — the toast
 * sits at 0% forever. The `!` unary operator matches when the boolean `is_live`
 * field is False (or absent), so a normal non-live video passes the filter and
 * downloads exactly as before, while a live video fails it and yt-dlp skips the
 * download (printing a "does not pass filter … skipping" line that
 * `runVideoDownload` turns into a friendly error). The form's metadata live-gate
 * still runs first for earlier, nicer feedback; this is defense in depth beneath.
 *
 * `--force-ipv4` (when set) matches the metadata probe, which already forces v4:
 * without it a download could stall on a broken IPv6 route the probe sidestepped.
 *
 * `--no-playlist` keeps the download in lock-step with `fetchVideoInfo` (also
 * called with it): a `watch?v=…&list=…` URL downloads the single video whose
 * title and live-status the form inspected, not the whole playlist. A pure
 * playlist URL (no video reference) still downloads every entry.
 *
 * `--newline` makes yt-dlp terminate each progress update with a real newline.
 * On a pipe (non-TTY) it otherwise redraws progress with bare `\r`, which a
 * line-buffered reader would sit on until the download finished.
 */
export function buildVideoDownloadArgs(a: VideoDownloadArgs): string[] {
  const args = ["-P", a.destination, "-o", a.outputTemplate, "--ffmpeg-location", a.ffmpegPath, "--no-playlist"];
  args.push("--match-filters", "!is_live");
  if (a.forceIpv4) {
    args.push("--force-ipv4");
  }
  if (a.denoPath) {
    args.push("--js-runtimes", `deno:${a.denoPath}`);
  }
  const [downloadFormat, target] = a.format.split("#");
  if (downloadFormat === "bestaudio") {
    // Without an explicit selector yt-dlp would download its default best
    // video+audio and then strip the audio — many times the bytes needed.
    // `/best` covers sites that publish no audio-only stream.
    args.push("--format", "bestaudio/best", "--extract-audio", "--audio-format", target, "--audio-quality", "0");
  } else {
    args.push("--format", downloadFormat, "--merge-output-format", target);
  }
  args.push("--progress", "--newline", "--print", `after_move:${FILEPATH_TAG}%(filepath)s`, a.url);
  return args;
}

export type VideoDownloadResult = { filePath: string };

/**
 * Run yt-dlp for a media download. `onProgress` receives the download percentage
 * as yt-dlp reports it. Resolves with the downloaded file path on a zero exit;
 * rejects with the stderr text on a non-zero exit, or with a watchdog error if
 * yt-dlp stalls. Progress and the `after_move:filepath` line are read from stdout.
 */
export async function runVideoDownload(
  binaryPath: string,
  options: VideoDownloadArgs,
  onProgress: (percent: number) => void,
): Promise<VideoDownloadResult> {
  let filePath = "";
  // Line-buffered (via onStdoutLine) so a tagged filepath split across two
  // stream chunks is still matched whole.
  const handleLine = (line: string) => {
    const progress = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(line);
    if (progress) {
      onProgress(Number(progress[1]));
      return;
    }
    const tagged = FILEPATH_LINE_RE.exec(line.trim());
    if (tagged) {
      filePath = tagged[1].trim();
    }
  };
  const { code, stdout, stderr } = await runWithWatchdog(binaryPath, buildVideoDownloadArgs(options), {
    idleMs: options.idleMs ?? DEFAULT_IDLE_MS,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
    onStdoutLine: handleLine,
    abortSignal: options.abortSignal,
  });
  // A live URL is skipped by the `!is_live` match filter: yt-dlp exits 0 but
  // writes no file (no after_move line, so filePath stays empty). Surface that
  // as a clear error instead of resolving with an empty path that reads as a
  // successful download. Gated on the recognizable skip line so a genuine
  // download whose after_move line we simply failed to parse isn't mislabeled.
  if (!filePath && MATCH_FILTER_SKIP_RE.test(stdout + stderr)) {
    throw new Error("Live streams are not supported. Try again after the stream ends.");
  }
  if (code === 0) return { filePath };
  throw new Error(stderr.trim() || `yt-dlp exited with code ${code}`);
}

export type ThumbnailDownloadArgs = {
  url: string;
  /** Destination directory, passed via `-P` (NOT %-expanded by yt-dlp, so a folder with a literal `%` is safe). */
  destination: string;
  /** Filename template relative to `destination`, passed via `-o`. */
  outputTemplate: string;
  /** Emit `--force-ipv4` to match the metadata probe / download path's networking. */
  forceIpv4?: boolean;
  /** Idle-watchdog window in ms. Defaults to DEFAULT_IDLE_MS if omitted. */
  idleMs?: number;
  /** Aborting cancels the download mid-flight. */
  abortSignal?: AbortSignal;
};

/**
 * Build yt-dlp CLI args to fetch only a URL's thumbnail image; the video itself
 * is skipped. Like the video path, the destination goes via `-P` and the
 * filename via a relative `-o`, so a folder containing a literal `%` doesn't
 * detonate the `-o` template.
 */
export function buildThumbnailArgs(a: ThumbnailDownloadArgs): string[] {
  const args = ["--write-thumbnail", "--skip-download", "--no-playlist", "-P", a.destination, "-o", a.outputTemplate];
  if (a.forceIpv4) {
    args.push("--force-ipv4");
  }
  args.push(a.url);
  return args;
}

export type ThumbnailResult = { filePath: string };

/**
 * Run yt-dlp to save only a URL's thumbnail. Resolves with the saved image path,
 * parsed from yt-dlp's "Writing ... thumbnail ... to:" stdout line, on a zero exit;
 * rejects with the stderr text on a non-zero exit. If the path line is not matched
 * the promise still resolves, with an empty `filePath`.
 */
export async function runThumbnailDownload(
  binaryPath: string,
  options: ThumbnailDownloadArgs,
): Promise<ThumbnailResult> {
  let filePath = "";
  const handleLine = (line: string) => {
    const match = /Writing .*?thumbnail.*? to:\s*(.+)$/.exec(line.trim());
    if (match) filePath = match[1].trim();
  };
  const { code, stderr } = await runWithWatchdog(binaryPath, buildThumbnailArgs(options), {
    idleMs: options.idleMs ?? DEFAULT_IDLE_MS,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
    onStdoutLine: handleLine,
    abortSignal: options.abortSignal,
  });
  if (code === 0) return { filePath };
  throw new Error(stderr.trim() || `yt-dlp exited with code ${code}`);
}
