# The Downloader Changelog

## [Initial Version] - {PR_MERGE_DATE}

The Downloader saves video, audio, image galleries, Spotify music, complete webpages, and transcripts from a URL.

- **Download** — paste a URL and choose what to grab. The form follows the source: quality and container for video, format for audio-only, save mode for webpages, language for transcripts. Turn on Exact Format Selection to pick from every concrete yt-dlp format with its file size.
- **Fast Download** — takes a URL as a command argument and downloads it straight away using your saved defaults, with no form.
- **AI tools** — `download-video` and `extract-transcript`, so Raycast AI can fetch a video or read its subtitles for you.
- **Sources** — yt-dlp for video and audio, gallery-dl for image galleries, spotDL for Spotify tracks, albums and playlists, and monolith for webpages saved as a single HTML file.
- **Setup** — missing command-line tools are installed for you through Homebrew on macOS or winget on Windows. spotDL is not packaged by either, so its prebuilt binary is fetched from the project's official GitHub release and checked against the SHA-256 GitHub publishes for the asset.
- **macOS and Windows.**

### Credits

The Downloader started as a fork of [Video Downloader](https://www.raycast.com/vimtor/video-downloader) by vimtor and its contributors, and still builds on that extension's yt-dlp and transcript foundations. See the README for the full acknowledgement.
