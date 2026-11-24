# SongForge

Paste a YouTube link, clip the part that's a song, tag it with a title, artist and cover art, and listen in SongForge's built-in player or in Spotify through Local Files.

## Install

Go to the [latest release](https://github.com/ShadowHexYT/SongForge/releases/latest), download **SongForge-Setup-<version>.exe** (for example `SongForge-Setup-1.2.0.exe`) and run it. Windows may show a SmartScreen warning because the app isn't code-signed. Click **More info → Run anyway**.

After that, SongForge updates itself: when a new release is out, a card in the app offers **Download update**, then **Restart now**. SongForge is also listed in [FrozenKingdom](https://github.com/ShadowHexYT/FrozenKingdom-releases) under **Music**.

## Features

### Getting songs in
- **One smart box.** Paste one or many links and they go into a background download queue. Type anything else and it searches YouTube inside the app.
- **Many sites.** Any link yt-dlp supports, including YouTube, TikTok, Instagram, X, SoundCloud, Bilibili and Weverse. Login and region errors are explained in plain words.
- **Whole playlists and channels.** Paste a YouTube playlist or channel, or a SoundCloud set or artist page, and tick which videos to queue. Videos you've already forged are marked. Lists over 50 videos start unticked.
- **Clipboard prompt.** When you switch back to SongForge after copying a link, it asks whether to forge it. The clipboard is read only at that moment and is never stored.
- **Import songs.** Bring in MP3/M4A/FLAC/WAV/OGG files with their tags, covers and lyrics. Any audio or video file on your PC can also be opened as a source to clip.
- **Drafts.** Clip work is saved automatically. "Continue where you left off" brings back clips, markers and settings.

### Studio editor
- **Layout.** Clips and markers on the left; video, transport, waveform and overview in the center; a tabbed inspector (Trim / Sound / Tags / Cover / Lyrics) on the right.
- **Precision trimming.** Zoomed waveforms around the start and end that you can jog (Shift for fine control), ±0.01 s and ±0.1 s nudges, snapping to the nearest quiet spot, and previews of the first and last 3 seconds.
- **Several clips per video.** Add as many clips as you like, or one per YouTube chapter. **Suggest clips** finds the songs in long videos from chapters or by listening for music between talking. **Forge all** exports them together.
- **Sound.** Speed, pitch, gain and fades, heard live while you edit. Bass, mid and treble EQ plus reverb. Presets: Sped up, Nightcore, Slowed, Dreamy, Slowed + reverb, Vocal clarity, Bass boost, Concert hall, Warm, plus up to 5 of your own. Loudness normalization to −14 LUFS and a light denoise.
- **Instrumental / karaoke.** Remove the voice, or keep only the voice, with Demucs (a free AI add-on installed from Settings; needs Python).
- **Editing tools.** Undo/redo for every edit (Ctrl+Z / Ctrl+Y), markers (M) that turn into clips, and duplicating a clip (for example to make a sped-up version). Press `?` for all shortcuts.

### Tags, covers and lyrics
- **Auto-fill.** The title and artist are guessed from fancam, MV and "Artist - Title" naming patterns.
- **Look up.** Fills in the album, year, genre and official cover from the free iTunes catalog. Only the title and artist are sent.
- **Cover art.** The YouTube thumbnail, any video frame, or your own image, cropped to a square and embedded as a 1000×1000 JPEG.
- **Lyrics.** Time-synced lyrics from LRCLIB (free), or paste your own. They scroll karaoke-style in Now Playing, with a timing nudge for live versions, and are written into the MP3 plus an `.lrc` file next to it.
- **Romanized and translated lyrics.** Under each lyric line, show how it sounds in Latin letters and what it means. Korean is romanized on your PC using Revised Romanization. Translations, and romanization for Japanese, Chinese and other scripts, come from Google Translate the first time a song is played and are then saved with the song. Pick the target language in Settings → Lyrics.
- **Output.** 320 kbps MP3 with ID3v2.3 tags, saved to `Music\SongForge`.

### Library and player
- **List and grid views**, search, an artist filter, playlists with `.m3u8` export, a queue, shuffle and repeat, and Windows media keys.
- **Tick songs, then act.** Tick songs (or Ctrl-click, Shift-click, Ctrl+A) and a bar above the player offers Play, Queue, add to a playlist, Medley, Share and Delete.
- **Playlist pages** take their colors from the songs' covers.
- **Now Playing.** Full screen, with the cover's colors behind it, synced lyrics, Up next and a Versions tab.
- **Versions.** Songs with the same title stack together, with A/B switching at the same spot in Now Playing.
- **Find duplicates** (Library → More). Finds songs you have twice and keeps the copy you choose; playlists switch to it. Different versions never count.
- **Medley / mashup.** Join songs into one track, with an adjustable crossfade, matched loudness and a fade-out at the end.
- **Re-clip and edit.** Change tags and cover later without re-encoding, or re-clip a song from its cached source.

### Sharing
- **Song packs.** Share a song, a playlist or ticked songs as one `.songforge` file. It holds the MP3s, covers, tags, lyrics and version info, but no file paths from your PC. A friend double-clicks it and gets the songs plus a playlist named after the pack. Songs they already have are skipped.

### Spotify
- **Spotify page.** Detects Spotify, checks whether the SongForge folder is a Local Files source, and has step-by-step setup for PC, iPhone and Android, plus a "songs greyed out?" checklist.

### Look and help
- **Themes.** Six dark palettes and three light ones, eight accent presets plus a custom color, and a System / Dark / Light mode.
- **Window sizes.** Works from 940×640 up to 2560×1440; the sidebar and clip list fold into rails on narrow windows.
- **First-run setup, guided tours and a Help page** with searchable step-by-step guides and keyboard shortcuts.
- **Notifications** when downloads, forges or imports finish while you're in another app.

## Why Spotify import goes through Local Files

Spotify has no public upload API, and its Web API can't add local files to playlists. The supported route is Local Files: once the SongForge folder is added as a source in Spotify Desktop, every forged song appears automatically. Listening on a phone needs Premium, a playlist on the PC, and the phone on the same Wi-Fi.

## Privacy

SongForge has no accounts, tracking or analytics. It talks only to the sites you download from, LRCLIB ("Find lyrics") and iTunes ("Look up"), which get just the song title and artist, Google Translate (lyric lines, only when translated or romanized lyrics are shown), and GitHub to check for updates.

## Run from source

```bash
npm install
npm run dev        # development, with hot reload
npm test           # unit tests (vitest)
npm run typecheck
npm run dist       # build a Windows installer into dist/
```

On first launch the app downloads `yt-dlp.exe` into `%APPDATA%\SongForge\bin`. ffmpeg comes bundled through `ffmpeg-static`.

Set `SONGFORGE_PROFILE=<folder>` to run with a separate library and settings (useful for testing without touching your own songs).

## Layout

```
src/main/      Electron main process: yt-dlp/ffmpeg pipeline, library store, packs, updates
src/preload/   Typed IPC bridge (window.api)
src/shared/    Types and pure logic: title guessing, duplicates, romanization, pack checks
src/renderer/  React UI (Tailwind v4, zustand, wavesurfer.js)
tests/         Unit tests for the shared logic and the zip reader
```

App data lives in `%APPDATA%\SongForge`: `library.json`, `settings.json`, `sources/` (cached downloads), `covers/` and `bin/`.

Downloading from YouTube may go against YouTube's Terms of Service. SongForge is meant for your own personal library only.
