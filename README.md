# The Downloader

Download videos, audio, image galleries, Spotify music, and complete webpages from the web — straight from Raycast.

## Commands

- **Download** — paste a URL into a form, choose the format and quality, then download.
- **Fast Download** — pass a URL as a command argument and download it instantly using your saved defaults — no form.

## What you need

The Downloader drives a few command-line tools:

- **yt-dlp** — videos and audio
- **Deno** — JavaScript runtime yt-dlp uses for YouTube extraction
- **ffmpeg** (with **ffprobe**) — audio extraction and format conversion
- **gallery-dl** — image galleries
- **spotDL** — Spotify tracks, albums, and playlists
- **monolith** — complete webpages saved as a single HTML file

The extension installs any that are missing for you on first use. yt-dlp, ffmpeg, gallery-dl, Deno, and monolith install via Homebrew on macOS:

```bash
brew install yt-dlp ffmpeg gallery-dl deno monolith
```

spotDL is not on Homebrew — the extension downloads its prebuilt binary directly the first time you use the Spotify feature.

## Supported sites

See [SUPPORTED_SITES.md](SUPPORTED_SITES.md).
