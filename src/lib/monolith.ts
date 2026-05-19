import { spawn } from "node:child_process";

export type MonolithSaveOptions = {
  url: string;
  /** Full path of the .html file monolith will write. */
  outputPath: string;
  /** True selects Lightweight mode (`--no-js`). */
  noJavaScript: boolean;
};

/** Build monolith CLI args. monolith writes the self-contained HTML to `outputPath`. */
export function buildMonolithArgs(o: MonolithSaveOptions): string[] {
  const args = ["--output", o.outputPath];
  if (o.noJavaScript) args.push("--no-js");
  args.push(o.url);
  return args;
}

/**
 * Derive a filesystem-safe `.html` filename from a URL — its host, path, and
 * query string, with separators and unsafe characters replaced by "-". Falls
 * back to "webpage.html" for an unparseable URL.
 */
export function webpageFilename(url: string): string {
  let raw = "webpage";
  try {
    const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
    const u = new URL(hasProtocol ? url : `https://${url}`);
    raw = `${u.hostname.replace(/^www\./, "")}${u.pathname}${u.search}`;
  } catch {
    // keep the "webpage" fallback
  }
  let safe = raw
    .replace(/[/\\?%*:|"<>=&\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (safe.length > 150) {
    safe = safe.slice(0, 150).replace(/[-.]+$/g, "");
  }
  return `${safe || "webpage"}.html`;
}

export type MonolithResult = { filePath: string };

/**
 * Run monolith. Resolves with the saved file path on a zero exit; rejects with
 * the stderr text on a non-zero exit. monolith writes the file itself via
 * `--output`, so the runner does not touch the filesystem. There is no progress
 * callback — monolith emits no parseable progress stream.
 */
export function runMonolithSave(binaryPath: string, options: MonolithSaveOptions): Promise<MonolithResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, buildMonolithArgs(options));
    let stderr = "";
    child.stderr.on("data", (data: Buffer) => (stderr += data.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ filePath: options.outputPath });
      else reject(new Error(stderr.trim() || `monolith exited with code ${code}`));
    });
  });
}
