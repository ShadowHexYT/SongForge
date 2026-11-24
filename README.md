# SongForge

Paste a YouTube link, clip the part that's a song, tag it with a title, artist and cover art, and listen in SongForge's built-in player or in Spotify through Local Files.

## Install

Download **SongForge-Setup.exe** from the [latest release](https://github.com/ShadowHexYT/SongForge/releases/latest) and run it. Windows may show a SmartScreen warning because the app isn't code-signed. Click **More info → Run anyway**.

## Run from source

```bash
npm install
npm run dev        # development, with hot reload
npm run dist       # build a Windows installer into dist/
```

On first launch the app downloads `yt-dlp.exe` into `%APPDATA%\SongForge\bin`. ffmpeg comes bundled through `ffmpeg-static`.

## Features

### Forge home
- **One smart box.** Paste one or many YouTube links and they go into a background download queue. Type anything else and it searches YouTube inside the app.
- **Drafts.** Clip work is saved automatically. "Continue where you left off" brings back clips, markers and settings.

### Studio editor
- **Layout.** A full-height workspace: clips and markers on the left; video, transport, waveform and overview in the center; a tabbed inspector (Trim / Sound / Tags / Cover) on the right.
- **Precision trimming.** Zoomed waveforms around the start and end that you can jog (Shift for fine control), ±0.01 s and ±0.1 s nudges, snapping to the nearest quiet spot, and previews of the first and last 3 seconds.
- **Live FX.** Speed, pitch (an AudioWorklet pitch shifter), gain and fades are applied while you listen. Exports use ffmpeg's rubberband filter for full quality. Presets: Sped up, Nightcore, Slowed, Dreamy.
- **Editing tools.** Undo/redo for every edit (Ctrl+Z / Ctrl+Y), markers (M) that turn into clips, and duplicating a clip (for example to make a sped-up version). Press `?` to see all keyboard shortcuts.

### Tutorial
- **Guided tours** spotlight the real controls one step at a time and adapt to any window size. The **App tour** is offered at the end of first-run setup. The **Studio tour** starts the first time you open a video, and the ? button in the studio header replays it. Use the arrow keys to move between steps and Esc to leave.
- **Help & tutorial page** in the sidebar: start the tours, read searchable step-by-step guides (first song, finding songs in long videos, trimming, effects, lyrics, instrumental, versions, import, Spotify on PC and phone, troubleshooting) and see the keyboard shortcuts.
- Tours and steps are defined in `src/renderer/src/components/Tour.tsx`. A step points at an element through its `data-tour="…"` attribute.

### Round 3
- **First-run setup.** Five short steps: welcome, theme and accent, Spotify folder, helpers, done. Run it again from Settings.
- **Suggest clips.** Finds the songs in long videos. It uses chapters when the video has them (merging intro, dance-break and remix parts of the same song) and otherwise listens for music between quieter talking parts. Opening a long video shows a "Found N songs" banner.
- **Lyrics.** A Lyrics tab finds time-synced lyrics on LRCLIB (free). You can also paste any lyrics, and pasted LRC text becomes synced automatically. The Genius button opens a search in your browser. Synced lyrics scroll karaoke-style in Now Playing, with a timing nudge for live versions, and are written into the MP3 plus an `.lrc` file next to it.
- **Effects.** Bass, mid and treble EQ plus reverb with a room-size control, all heard live while editing. Exports use the identical impulse response through ffmpeg `afir`. Built-in presets: Clean, Slowed + reverb, Vocal clarity, Bass boost, Concert hall, Warm. You can save up to 5 of your own.
- **Instrumental / karaoke.** A new "Voice & cleanup" option, plus a one-click "make instrumental version" button on each clip. It uses Demucs (the free AI add-on).
- **Versions.** Songs with the same title stack together. There's a badge in the library, a Versions dialog, a "Stack versions" toggle, and A/B switching at the same spot in Now Playing.
- **Import songs.** Bring in MP3/M4A/FLAC/WAV/OGG files. Tags, cover art and lyrics are read from the files; non-MP3 files are converted; importing the same file twice is skipped. Any audio or video file on your PC can also be opened as a source to clip.
- **More sites.** Any link yt-dlp supports, including TikTok, Instagram, X, SoundCloud, Bilibili and Weverse. Errors about logins or region blocks are explained in plain words.
- **Clipboard prompt.** When you switch back to SongForge after copying a link, it asks whether to forge it. The clipboard is only read at that moment and is never stored.
- **Notifications** when downloads, forges or imports finish while you're in another app.
- **Window sizes.** The sidebar and the clip list fold into rails on narrow windows, panels resize with the window, and the waveform, Now Playing and tables adapt from 940×640 up to 2560×1440.

### Themes
- Six dark palettes (Midnight, Graphite, Plum, Forest, Deep Sea, OLED Black) and three light ones (Daylight, Paper, Mist).
- Eight accent presets plus a custom color picker.
- A System / Dark / Light mode. Everything is driven by CSS variables (`src/renderer/src/lib/theme.ts`).

### Everything else

- **Paste → clip → tag → forge.** A waveform editor (wavesurfer.js) with a synced 480p video preview. Drag on the waveform to make a clip, or press `I`/`O` to set the start and end at the playhead. You can nudge points in 0.1 s steps and loop a clip while you work.
- **Several clips per video.** Add as many clips as you like, or create one per YouTube chapter in a single click. **Forge all** exports them together.
- **Auto-fill.** The title and artist are guessed from fancam, MV and "Artist - Title" naming patterns. `&t=` timestamps in the link set where the first clip starts.
- **Cover art.** Use the YouTube thumbnail, any video frame, or an uploaded or dropped image, then crop it to a square with pan and zoom. It's embedded in the MP3 as a 1000×1000 JPEG.
- **Sound.** Fade in and out, loudness normalization to −14 LUFS (Spotify's level), a light ffmpeg denoise, or optional AI vocal isolation with Demucs (installed from Settings; needs Python).
- **Output.** A 320 kbps MP3 with ID3v2.3 tags, saved to `Music\SongForge`.
- **Library and player.** List and grid views, search, artist filter, playlists with `.m3u8` export, queue, shuffle and repeat, a full-screen Now Playing view with lyrics, and Windows media keys.
- **Editing.** Change tags and cover later without re-encoding, or **Re-clip** a song from its cached source.
- **Spotify Sync page.** Detects Spotify, checks whether the SongForge folder is registered as a Local Files source, and walks through the steps for desktop and phone.

## Why Spotify import goes through Local Files

Spotify has no public upload API, and its Web API can't add local files to playlists. The supported route is Local Files: once the SongForge folder is added as a source in Spotify Desktop, every forged song appears automatically. Listening on a phone needs Premium, a playlist on the PC, and the phone on the same Wi-Fi.

## Layout

```
src/main/      Electron main process: yt-dlp/ffmpeg pipeline, library store, sf-media:// protocol
src/preload/   Typed IPC bridge (window.api)
src/shared/    Types and the title-guessing heuristics
src/renderer/  React UI (Tailwind v4, zustand, wavesurfer.js)
```

App data lives in `%APPDATA%\SongForge`: `library.json`, `settings.json`, `sources/` (cached downloads), `covers/` and `bin/`.

Downloading from YouTube may go against YouTube's Terms of Service. SongForge is meant for your own personal library only.
