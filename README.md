# SONORA — Personal AI Music Ecosystem

SONORA is a free, ad-free, local-first personal music player, synchronized lyrics studio, and offline-capable AI playlist assistant built for desktop (Windows, macOS, Linux) and mobile browsers (Android PWA / iOS Safari).

---

## Architecture Overview

SONORA uses a zero-cost, privacy-first **Local-First Web & PWA Architecture**:

- **Frontend UI**: React 19, TypeScript, Vite, Tailwind CSS v4
- **Local Database (`src/db/sonoraDb.ts`)**: Browser **IndexedDB** (`idb`) with separated object stores (`tracks`, `audioFiles`, `artworks`, `playlists`, `history`, `aiMemory`, `settings`) so track listings remain lightweight and cover art / audio binaries are lazy-loaded only on demand.
- **Metadata Extraction (`src/services/importer.ts`)**: `music-metadata` (`parseBlob`) parses MP3, WAV, FLAC, AAC, M4A, OGG, and OPUS files directly on the client, extracting ID3/Vorbis/MP4 tags, embedded artwork, and embedded lyrics, while automatically pairing sidecar `.lrc` files.
- **Audio Engine (`src/services/audioEngine.ts`)**: Dual-deck HTML5 Audio + Web Audio API graph with:
  - 10-band `BiquadFilterNode` Equalizer (`32Hz` – `16kHz`) + 7 presets
  - Real-time `AnalyserNode` FFT frequency visualizer (`src/components/AudioVisualizer.tsx`)
  - Configurable crossfade (`0s` – `10s`) and gapless playback
  - Playback speed (`0.75x` – `2x`), Smart Shuffle, Sleep Timer, and OS **Media Session API** controls
- **Synchronized Lyrics (`src/services/lyricsService.ts`)**: Full LRC timestamp parser (`[mm:ss.xx]`, `[offset:]`), click-to-seek, timestamp insertion editor, `.lrc` file import, and optional user-triggered lookup against the free open-source **LRCLIB** database (`lrclib.net`). Never fabricates lyrics.
- **Firebase Cloud Music Locker (`src/services/firebaseClient.ts`, `src/services/firebaseMusicService.ts`)**: Sign in with Google via Firebase Auth to bulk-upload songs and folders directly into your private Firestore locker (`users/{uid}/cloudTracks` with chunked audio payloads + paired `.lrc` lyrics + compressed artwork) protected by hardened Security Rules—so you can delete local copies from your laptop to save disk space and stream anytime across devices.
- **Tamil-Only Internet Streaming (`server.ts`, `src/services/catalogService.ts`)**: Fetches trending and searchable **Tamil** songs directly via `/api/tamil/trending` and `/api/tamil/search` (Apple iTunes IN official 30s previews + Audius Tamil Indie streams, transparently labeled `30s Preview` vs `Audius Full`).
- **SONORA AI Engine (`server.ts`, `src/services/sonoraAI.ts`)**:
  - Server-side `@google/genai` (`gemini-4-hydrogen` + Google Search Grounding) finds fresh Tamil songs online for requests like *"Top 5 trending Tamil songs"* while explicitly excluding your already-uploaded tracks unless you ask for your library.
  - Enforces a strict **6-Step Preview & Confirmation Workflow**: understands request -> searches live Tamil charts & resolves playable audio -> renders interactive playlist preview with source attribution -> allows select/deselect/replace/reorder -> creates playlist only on explicit click -> provides Play Now / Shuffle / Edit actions.
  - Offline rule-based fallback and optional local **Ollama** integration (`http://localhost:11434`) configurable in Settings.

---

## Project Folder Structure

```text
├── public/
│   ├── icon.svg
│   ├── apple-touch-icon.png
│   ├── pwa-192x192.png
│   ├── pwa-512x512.png
│   └── pwa-maskable-512x512.png
├── scripts/
│   ├── sonora-windows.bat
│   └── sonora-start.sh
├── src/
│   ├── components/
│   │   ├── AudioVisualizer.tsx
│   │   ├── BottomPlayer.tsx
│   │   ├── ConfirmCloudDeleteModal.tsx
│   │   ├── EqualizerModal.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── FullScreenPlayer.tsx
│   │   ├── GoogleSignInButton.tsx
│   │   ├── OfflineIndicator.tsx
│   │   ├── PWAInstallButton.tsx
│   │   ├── QueueDrawer.tsx
│   │   ├── TrackArtwork.tsx
│   │   └── TrackEditorModal.tsx
│   ├── contexts/
│   │   └── SonoraContext.tsx
│   ├── db/
│   │   └── sonoraDb.ts
│   ├── hooks/
│   │   ├── useOnlineStatus.ts
│   │   └── usePWAInstall.ts
│   ├── services/
│   │   ├── audioEngine.ts
│   │   ├── catalogService.ts
│   │   ├── firebaseClient.ts
│   │   ├── firebaseMusicService.ts
│   │   ├── importer.ts
│   │   ├── lyricsService.ts
│   │   └── sonoraAI.ts
│   ├── types/
│   │   └── music.ts
│   ├── utils/
│   │   └── formatters.ts
│   ├── views/
│   │   ├── DiscoverView.tsx
│   │   ├── FavoritesView.tsx
│   │   ├── HomeView.tsx
│   │   ├── LibraryView.tsx
│   │   ├── LyricsView.tsx
│   │   ├── PlaylistDetailView.tsx
│   │   ├── PlaylistsView.tsx
│   │   ├── SearchView.tsx
│   │   ├── SettingsView.tsx
│   │   ├── SonoraAIView.tsx
│   │   └── StatsView.tsx
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── firestore.rules
├── firebase-blueprint.json
├── index.html
├── metadata.json
├── package.json
├── server.ts
└── vite.config.ts
```

---

## Windows Desktop Setup & Launch

1. Install **Node.js LTS** (v20+ recommended) from [nodejs.org](https://nodejs.org/).
2. Double-click `scripts/sonora-windows.bat` (or run `npm install && npm run dev` in Command Prompt / PowerShell).
3. Your browser opens `http://localhost:3000`.
4. To run SONORA as a standalone Windows desktop app window: click **"Install SONORA App"** in the bottom-left sidebar (or the Install icon in Microsoft Edge / Google Chrome's address bar).

---

## Android PWA Installation

1. Open SONORA in **Google Chrome** on Android.
2. Tap **"Install SONORA App"** in the top bar (or Chrome menu `⋮` -> **Install app** / **Add to Home screen**).
3. Launch SONORA from your Android home screen in standalone mode.
4. Import audio files or folders via **My Library -> Import Songs / Import Folder**. Once imported, songs play completely offline with lock-screen Media Session controls.

---

## Platform-Specific Limitations

- **Browser Storage Sandbox**: For user security, web browsers and PWAs cannot silently scan arbitrary OS directories (`C:\Users\...\Music` or `/sdcard/Music`) without explicit user selection. Use **Import Music Folder** or **Import Songs** once; SONORA indexes and caches the audio safely in IndexedDB without altering or deleting original files.
- **iOS Safari**: Apple WebKit does not support `beforeinstallprompt` or `webkitdirectory` folder auto-scanning. iOS users install via **Share -> Add to Home Screen** and import audio files using **Import Songs**.
- **Optional Local Ollama**: When accessing SONORA over HTTPS, browsers may restrict `http://localhost:11434` mixed-content requests unless running locally (`http://localhost:3000`) with Ollama CORS enabled (`OLLAMA_ORIGINS=*`). SONORA AI always functions without Ollama.

---

## Troubleshooting Guide

- **Songs don't play when offline**: Only tracks imported into **My Library** (`Local`) are cached offline in IndexedDB. Tracks stored in **Firebase Cloud** or streamed online require an active internet connection.
- **Equalizer has no effect on an internet stream**: Some external servers omit CORS headers, causing SONORA to automatically fall back to direct `<audio>` playback so the song still plays cleanly. All locally imported files and Firebase Cloud streams pass through the 10-band Web Audio Equalizer and Visualizer.
- **Quota exceeded when importing thousands of lossless FLAC files**: Upload bulk collections to **Firebase Cloud Music Locker** in **My Library** instead—then you can safely delete local copies from your laptop to free disk space.
- **Backup & Restore**: Export your playlists, lyrics, listening stats, and AI preferences anytime from **Settings -> Export Backup (.json)**.
