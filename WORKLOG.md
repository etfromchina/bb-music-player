# w-music Worklog

## Goal

1. Build a stable `w-music` desktop exe that does not crash on startup.
2. Keep the player UI close to the provided design resources.
3. Use rounded corners and soft shadows, but do not use transparent-through background.
4. Do not add an extra fake outer border as a workaround.
5. Make the default medium window show the lower queue area without manual resize.
6. Use the root `icon.png` as the application icon.

## Current decisions

- Electron remains the desktop shell.
- Existing parse/playback server endpoints are kept and reused.
- The renderer layer is allowed to be rebuilt when stability or fidelity requires it.
- `w_music_medium_mode/code.html` is the main visual reference for the medium layout.

## Confirmed issues found during development

- Older packaged builds could flash and exit on startup.
- A later build could stay alive but show a blank white window.
- The previous renderer files had broken encoding and malformed HTML/JS, so they were not a safe base for continued patching.
- Some earlier UI changes drifted away from the original design direction.

## 2026-03-22 progress

- Replaced `public/index.html`, `public/styles.css`, and `public/app.js` with a clean renderer implementation.
- Kept the local API contract for `/api/parse` and audio proxy routes.
- Removed transparent-through background behavior and kept the player surface opaque.
- Rebuilt the medium UI into a rounded, shadowed, design-led layout with pink primary controls.
- Tuned the default medium window size to `392 x 760` so the queue section is visible on first launch.
- Rebuilt Windows outputs and verified `dist/win-unpacked/w-music.exe` stays alive after launch.

## Deliverables

- `dist/win-unpacked/w-music.exe`
- `dist/w-music Setup 1.0.0.exe`

## Validation checklist

1. Startup is stable.
2. Window is not blank.
3. UI remains opaque and visually close to the design.
4. Medium mode shows the queue area by default.
