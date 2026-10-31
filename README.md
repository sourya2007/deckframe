# DeckFrame

A cinematic screen recorder and lite 3D video editor for SaaS demo videos.

## Features

- **Capture** — pick a screen or window, optional microphone and webcam sidecars, cursor/click telemetry, pause/resume from the HUD.
- **Editor** — 3D camera framing, cinematic backgrounds, rounded frames, webcam bubble, trim, zoom regions, speed regions, annotations, captions.
- **Motion** — camera pose keyframes (`linear` / `ease` / `hold`) and motion effects (`shake`, `pulse`, `glitch`, `fade-black`, `fade-white`).
- **Timeline tools** — Select, Move (drag clips or pan the preview), Cut (click to razor clips at that point), SFX lane.
- **Sound library** — scans a folder you choose, filters by category/length, previews tracks, and adds SFX at the playhead. SFX are mixed into editor playback and exports.
- **AI Autopilot** — OpenAI, Anthropic, or local Ollama; applies clamped tool calls for zooms, keyframes, effects, captions, trims and speed.
- **Export** — MP4 (H.264/NVENC with x264 fallback), WebM, ProRes, or GIF, with configurable destination.
- **Productivity** — undo/redo (`Ctrl+Z`, `Ctrl+Shift+Z` / `Ctrl+Y`), autosave/crash recovery, recent projects, keyboard transport.

## Development

Requirements: Node 20+ (Node 22/26 also works), Windows for the packaged build.

```bash
npm install
```

Run the renderer and Electron in two terminals:

```bash
# terminal 1 — Vite dev server on http://localhost:5173
npm run dev

# terminal 2 — compile main/preload and launch Electron
npm run dev:electron
```

The Electron window loads the Vite server while unpackaged, so keep terminal 1 running.

### Smoke checks

```bash
npm run smoke        # timeline math + undo/redo stack
npm run build        # main/preload tsc + renderer production build
```

The AI/timeline smoke scripts also accept a compiled module path:

```bash
node scripts/_timeline-smoke.js .tmp-smoke/timeline.js
node scripts/_history-smoke.js .tmp-smoke/history.js
node scripts/_ai-smoke.js <compiled-aiActions.js>
node scripts/_ai-chat-smoke.js <compiled-ai.js>
```

## Build for Windows

```bash
npm run dist:win
```

Outputs:

- Installer: `release/DeckFrame Setup 1.0.0.exe`
- Portable: `release/DeckFrame 1.0.0.exe`

The build is unsigned, so Windows SmartScreen may warn on first run (`More info` → `Run anyway`). `electron-builder.yml` sets `npmRebuild: false` because the Windows native prebuilds (`uiohook-napi`, ffmpeg) ship ready to use; this keeps CI from requiring Visual Studio.

## Data & settings

- Projects: `.deckframe` files (Save/Open, recent list, `Ctrl+S` / `Ctrl+O`).
- Autosave: `%APPDATA%\deckframe\autosave.deckframe`, restored on launch.
- Settings: `%APPDATA%\deckframe\settings.json`.
- Diagnostics: `%APPDATA%\deckframe\recording-diagnostics.log`.

API keys and settings are stored in plain text in `settings.json`; this is a local desktop app, but do not share that file.

## Notes / current limits

- The updater UI is wired to `electron-updater`; a real update feed requires `publish` configuration for a release provider.
- Autosave restores the last session on launch (no prompt).
- Screen recording and export are Windows-first; macOS/Linux capture paths are not validated.
- SFX export mixes library effects in real time during the hidden-window render.
