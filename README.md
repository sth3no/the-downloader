# The Downloader

Download videos, audio, and image galleries from the web — straight from Raycast.

## What you need

The Downloader drives a few command-line tools:

- **yt-dlp** — videos and audio
- **ffmpeg** (with **ffprobe**) — audio extraction and format conversion
- **gallery-dl** — image galleries

The extension installs any that are missing for you on first use. To install them yourself on macOS:

```bash
brew install yt-dlp ffmpeg gallery-dl
```

## Supported sites

See [SUPPORTED_SITES.md](SUPPORTED_SITES.md).
