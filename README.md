# w-music

`w-music` is a lightweight player that parses Bilibili and YouTube links into playable audio playlists.

The project currently has two usage modes:

- Web mode: a browser-based player served by the local Node.js app
- Desktop mode: an Electron-based Windows app with large / medium / small player layouts

## Recommended release

The current recommended desktop release is the Lite build:

- Release page: [w-music-Lite v1.0.1-lite.0](https://github.com/etfromchina/bb-music-player/releases/tag/v1.0.1)
- Download: [w-music-Lite-1.0.1-lite.0-win.zip](https://github.com/etfromchina/bb-music-player/releases/download/v1.0.1/w-music-Lite-1.0.1-lite.0-win.zip)
- Lite source branch: [codex/w-music-Lite](https://github.com/etfromchina/bb-music-player/tree/codex/w-music-Lite)

Why Lite is recommended:

- much smaller package size than the previous full desktop zip
- keeps the current floating rounded-card desktop UI
- keeps core playback behavior
- keeps only `zh-CN` and `en-US` Electron locale files as a low-risk slimming step

## Current status

- The desktop app is the current polished target.
- The renderer layer is shared by both web mode and Electron mode.
- Most UI changes in `public/` affect both the web page and the desktop app.
- Electron-specific behavior lives in `electron/` and only affects the desktop build.

## Features

- Parse `bilibili.com` and `b23.tv` links into playlists
- Parse `youtube.com` and `youtu.be` links into playlists
- Append multiple source links into one continuous queue
- Play, pause, previous, next, seek, volume, and quality switching
- Cover art, queue view, large / medium / small layouts
- Electron desktop window controls and floating rounded-card UI

## Tech stack

- Frontend: Vanilla JavaScript + HTML + CSS
- Backend: Node.js + Express
- HTTP: Axios
- YouTube parsing: `@distube/ytdl-core`
- Desktop shell: Electron

## API

### `GET /api/parse?url={video_url}`

Returns album title, cover image, and playlist items for a supported Bilibili or YouTube link.

### `GET /api/audio/:bvid/:cid`

Bilibili audio proxy endpoint.

### `GET /api/audio/youtube/:videoId`

YouTube audio proxy endpoint.

Both audio endpoints support `quality=high|low`.

## Local development

```bash
npm install
npm run dev
```

Default local URL:

```text
http://localhost:30030
```

## Desktop development

```bash
npm install
npm run desktop:dev
```

## Build desktop release

```bash
npm run desktop:build
```

Main project build output is written to `dist/`.

If you want the smaller Lite desktop variant, use the separate Lite source branch:

- [codex/w-music-Lite](https://github.com/etfromchina/bb-music-player/tree/codex/w-music-Lite)

The Lite branch builds these desktop artifacts:

- `dist/win-unpacked/w-music-Lite.exe`
- `dist/w-music-Lite-1.0.1-lite.0-win.zip`

## Project structure

- `public/index.html`: shared player markup
- `public/styles.css`: shared player styles
- `public/app.js`: shared player state and interactions
- `server.js` / `server.cjs`: backend service and parse/proxy endpoints
- `electron/main.cjs`: Electron main process
- `electron/preload.cjs`: Electron preload bridge
- `WORKLOG.md`: desktop-focused work log

## Notes

- Some Bilibili and YouTube links can fail due to upstream restrictions or rate limits.
- The web player and desktop player share the same renderer, so UI tweaks usually affect both.
- The Electron-specific window shell, startup flow, and packaging logic do not affect plain web mode.
- The Lite release is currently the recommended Windows desktop download.
