import { spawn } from "node:child_process";

export type GalleryDownloadOptions = {
  url: string;
  destination: string;
  cookiesFromBrowser?: string;
};

/** Build gallery-dl CLI args. `-d` is the base dir; gallery-dl creates per-site subfolders. */
export function buildGalleryArgs(o: GalleryDownloadOptions): string[] {
  const args = ["-d", o.destination];
  if (o.cookiesFromBrowser) args.push("--cookies-from-browser", o.cookiesFromBrowser);
  args.push(o.url);
  return args;
}

export type GalleryProgress = { files: number };

/** Run gallery-dl; onProgress fires as files land. Resolves with the count or rejects with stderr. */
export function runGalleryDownload(
  binaryPath: string,
  options: GalleryDownloadOptions,
  onProgress: (p: GalleryProgress) => void,
): Promise<GalleryProgress> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, buildGalleryArgs(options));
    let files = 0;
    let stderr = "";
    child.stdout.on("data", (data: Buffer) => {
      // gallery-dl prints one downloaded file path per line, so non-empty lines ≈ files downloaded (progress estimate).
      const lines = data.toString().split("\n").filter((l) => l.trim().length > 0);
      files += lines.length;
      onProgress({ files });
    });
    child.stderr.on("data", (data: Buffer) => (stderr += data.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ files });
      else reject(new Error(stderr.trim() || `gallery-dl exited with code ${code}`));
    });
  });
}
