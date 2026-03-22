# w-music-Lite

`w-music-Lite` is a low-risk slimmed desktop build of `w-music`.

It is created from the stable desktop codebase, but trims packaging scope where it is considered safe:

- keeps the shared renderer and playback logic
- keeps the Electron desktop shell
- trims Electron language payload to the languages we actually need
- focuses on directory and zip output instead of shipping extra release forms first

## Goal

This variant exists to reduce desktop package size without touching core runtime files that could break playback or startup.

## What is changed

- Product name: `w-music-Lite`
- App ID: `com.etfromchina.wmusiclite`
- Desktop window title: `w-music-Lite`
- Electron language files limited to:
  - `en-US`
  - `zh-CN`
- Build output goes to the Lite project's own `dist/`

## What is not changed

- Bilibili / YouTube parsing logic
- Audio proxy endpoints
- Player layouts and core playback behavior
- Shared frontend renderer structure

## Build

```bash
npm install
npm run desktop:build
```

## Notes

- This Lite variant is intended as a safer size-reduction experiment.
- If startup or playback regression appears, compare behavior against the main `w-music` project.
