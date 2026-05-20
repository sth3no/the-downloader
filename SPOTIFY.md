# Spotify Downloads

The Downloader uses [spotDL](https://github.com/spotDL/spotify-downloader) for Spotify links — pasted track, album, or playlist URLs get fetched as audio files (MP3, M4A, OPUS, or FLAC, your choice).

spotDL needs Spotify API credentials to look up track metadata (title, artist, album, cover art). Without them it falls back to an anonymous flow that frequently fails with _"Could not get session auth tokens"_. The fix is a free Spotify Developer app — it takes about a minute, and you only do it once.

## One-time setup

### 1. Create a Spotify Developer app

1. Go to https://developer.spotify.com/dashboard. Log in with any Spotify account (free works).
2. Click **Create app**.
3. Fill in:
   - **App name** — anything, e.g. `Raycast Downloader`.
   - **App description** — anything, e.g. `Personal use`.
   - **Redirect URI** — `http://127.0.0.1:8080/callback`. Any value works; spotDL never opens it.
   - **Which API/SDKs are you planning to use?** — tick **Web API**.
4. Accept the terms and click **Save**.

### 2. Grab your credentials

1. From the dashboard, open your new app.
2. Click **Settings** (top right).
3. **Client ID** is shown — copy it.
4. Click **View client secret** — copy that too.

### 3. Paste them into the extension

1. In Raycast, press **⌘,** with the extension's command focused (or right-click → **Configure Extension**).
2. Paste your Client ID into **Spotify: Client ID**.
3. Paste your Client Secret into **Spotify: Client Secret**.
4. Close preferences. Done.

## What this enables

- Track downloads (`open.spotify.com/track/…`)
- Album downloads (`open.spotify.com/album/…`)
- Playlist downloads (`open.spotify.com/playlist/…`) — public playlists only

Files land in your configured download folder, named `<Artists> - <Title>.<ext>`. The audio itself is sourced from YouTube Music via yt-dlp — that's how spotDL works under the hood; Spotify doesn't expose raw audio.

## Troubleshooting

**Still getting "Could not get session auth tokens"** — double-check that both Client ID and Client Secret are pasted with no surrounding whitespace. Spotify Client IDs are 32 hex-like characters; Client Secrets are also 32.

**"AudioProviderError" or YouTube-side errors** — the track isn't available on YouTube Music (region-locked, removed, etc.). spotDL can't work around this.

**Private playlists fail** — spotDL needs OAuth (`--user-auth`) for private playlists. Not currently exposed by the extension; open an issue if you need it.
