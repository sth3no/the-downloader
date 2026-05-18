# The Downloader

Download videos, audio, image galleries, and Spotify music from the web — straight from Raycast.

## What you need

The Downloader drives a few command-line tools:

- **yt-dlp** — videos and audio
- **ffmpeg** (with **ffprobe**) — audio extraction and format conversion
- **gallery-dl** — image galleries
- **spotDL** — Spotify tracks, albums, and playlists

The extension installs any that are missing for you on first use. yt-dlp, ffmpeg, and gallery-dl install via Homebrew on macOS:

```bash
brew install yt-dlp ffmpeg gallery-dl
```

spotDL is not on Homebrew — the extension downloads its prebuilt binary directly the first time you use the Spotify feature.

## Supported sites

See [SUPPORTED_SITES.md](SUPPORTED_SITES.md).
