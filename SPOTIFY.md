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
   - **Website** — leave blank.
   - **Redirect URIs** — type `http://127.0.0.1:8080/callback`, **then click the purple `Add` button on the right.** This is the easy-to-miss step — the URI needs to show up as a chip below the field; just typing it isn't enough. Any URL works (spotDL never opens it), but Spotify is strict: `http://localhost/...` is rejected, `http://127.0.0.1:<port>/...` works.
   - **Which API/SDKs are you planning to use?** — tick **Web API**.
4. Tick **I understand and agree with Spotify's Developer Terms of Service and Design Guidelines** and click **Save**.

### 2. Grab your credentials

After Save, you land on the app's **Basic Information** screen:

- **Client ID** is shown at the top in a copy-friendly box — copy it.
- Just below, click **View client secret** — the secret expands inline; copy it.
- (You'll also see **App Status: Development mode**, **App name**, **Redirect URIs**, **APIs used: Web API** — that's all expected for a personal-use app.)

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

**Still getting "Could not get session auth tokens"** — double-check that both Client ID and Client Secret are pasted with no surrounding whitespace. Spotify Client IDs are 32 hex-like characters; Client Secrets are also 32. The extension automatically passes `--use-official-api` when both are set, which routes spotDL through the Spotify Web API and skips its broken librespot fallback — so if both fields are filled correctly, this error should not appear.

**`Failed to fetch secrets: code.thetadev.de` in the log** — that's spotDL trying to refresh librespot's anonymous secrets from a third-party host. It's only used when the extension doesn't pass `--use-official-api`. Setting your Client ID/Secret makes this fetch unnecessary; the line should disappear from the log after you fill them in.

**"AudioProviderError" or YouTube-side errors** — the track isn't available on YouTube Music (region-locked, removed, etc.). spotDL can't work around this.

**Private playlists fail** — spotDL needs OAuth (`--user-auth`) for private playlists. Not currently exposed by the extension; open an issue if you need it.
