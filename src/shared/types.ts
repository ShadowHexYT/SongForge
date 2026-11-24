export interface SongMeta {
  title: string
  artist: string
  album: string
  year: string
  genre: string
  lyrics: string
  /** Time-synced lyrics in LRC format ("[mm:ss.xx] line"), optional */
  syncedLyrics?: string
}

/** 'vocals' keeps only the voice; 'instrumental' removes it (karaoke). Both use Demucs. */
export type Cleanup = 'none' | 'denoise' | 'vocals' | 'instrumental'

/** Tone and space effects. EQ values are in dB; reverb and room are 0..1. */
export interface FxSettings {
  bass: number
  mid: number
  treble: number
  reverb: number
  room: number
}

export const FX_DEFAULTS: FxSettings = { bass: 0, mid: 0, treble: 0, reverb: 0, room: 0.5 }

export interface FxPreset {
  id: string
  name: string
  fx: FxSettings
  /** Presets may also set speed and pitch (e.g. "Slowed + reverb") */
  speed?: number
  pitch?: number
}

export const MAX_CUSTOM_PRESETS = 5

export interface ClipSettings {
  start: number
  end: number
  fadeIn: number
  fadeOut: number
  normalize: boolean
  cleanup: Cleanup
  /** Output gain in dB, applied after normalization */
  gain: number
  /** Pitch shift in semitones */
  pitch: number
  /** Tempo multiplier (1 = original) */
  speed: number
  fx: FxSettings
}

export const CLIP_DEFAULTS: Pick<ClipSettings, 'gain' | 'pitch' | 'speed' | 'fx'> = { gain: 0, pitch: 0, speed: 1, fx: FX_DEFAULTS }

export interface Song extends SongMeta, ClipSettings {
  id: string
  filePath: string
  coverPath: string | null
  duration: number
  sourceUrl: string
  sourceId: string
  sourceTitle: string
  createdAt: number
  updatedAt: number
  /** Manual version-stack override; when unset, songs stack by normalized title */
  versionGroup?: string
  /** Added with "Import songs" rather than forged */
  imported?: boolean
  /** Where an imported song was copied from, so importing the same file twice is skipped */
  importedFrom?: string
  /** Shift (seconds) applied to synced lyrics, for live versions that don't line up */
  lyricsOffset?: number
  /** Song ids this medley was made from */
  medleyOf?: string[]
  /** Came from a friend's song pack */
  fromPack?: string
  /** Translation and romanization of the lyrics, fetched once and kept */
  lyricsExtra?: LyricsExtra
}

/** Per lyric line: [romanization, translation]. Either can be empty. */
export interface LyricsExtra {
  /** Language the lyrics are in, as the translator detected it ('ko', 'ja'…) */
  lang: string
  /** Language they were translated into */
  to: string
  lines: Record<string, [string, string]>
  /** Which lyrics text this was made from, so edited lyrics get translated again */
  key?: string
}

export interface Playlist {
  id: string
  name: string
  songIds: string[]
  createdAt: number
}

export interface Chapter {
  title: string
  start: number
  end: number
}

export interface SourceInfo {
  id: string
  url: string
  title: string
  channel: string
  uploadDate: string
  duration: number
  thumbnailUrl: string
  chapters: Chapter[]
  track?: string
  artist?: string
  album?: string
}

export interface PreparedSource extends SourceInfo {
  audioPath: string
  videoPath: string | null
  thumbnailPath: string | null
  peaks: number[]
  peaksPerSecond: number
}

export type Appearance = 'system' | 'dark' | 'light'

export interface Settings {
  appearance: Appearance
  darkTheme: string
  lightTheme: string
  accent: string
  customAccent: string
  outputDir: string
  bitrate: 320 | 256 | 192
  defaultNormalize: boolean
  defaultFadeIn: number
  defaultFadeOut: number
  downloadVideoPreview: boolean
  onboarded: boolean
  /** Custom sound presets (up to MAX_CUSTOM_PRESETS) */
  fxPresets: FxPreset[]
  /** Offer to forge a link you copied when you switch back to SongForge */
  clipboardWatch: boolean
  /** Windows notifications when downloads or forges finish in the background */
  notifications: boolean
  /** Guided tours already shown ('app', 'studio') */
  toursSeen: string[]
  /** Check GitHub for a new SongForge version on startup */
  autoUpdate: boolean
  /** Show romanization under Korean/Japanese/Chinese lyric lines */
  lyricsRoman: boolean
  /** Show a translation under each lyric line */
  lyricsTranslate: boolean
  /** Language code lyrics are translated into */
  translateTo: string
}

export interface ToolStatus {
  ytdlp: { ok: boolean; version?: string; path?: string }
  ffmpeg: { ok: boolean; path?: string }
  demucs: { ok: boolean; python?: string; error?: string }
}

export interface SpotifyStatus {
  installed: boolean
  folderRegistered: boolean
  outputDir: string
  songCount: number
}

export interface ProgressEvent {
  jobId: string
  stage: string
  percent: number
  detail?: string
}

export interface ExportRequest {
  jobId: string
  songId?: string
  source: Pick<PreparedSource, 'id' | 'url' | 'title' | 'audioPath'>
  meta: SongMeta
  clip: ClipSettings
  /** Path to a JPEG on disk, or a data URL of a newly cropped cover */
  cover: string | null
}

export interface LibraryData {
  songs: Song[]
  playlists: Playlist[]
}

export interface LyricsResult {
  id: number
  title: string
  artist: string
  album: string
  duration: number
  instrumental: boolean
  plain: string
  synced: string
}

export interface ImportResult {
  added: number
  skipped: number
  errors: string[]
  /** Playlists created from song packs */
  playlists?: string[]
}

/** A match from the music catalog lookup (iTunes Search). */
export interface TagMatch {
  id: number
  title: string
  artist: string
  album: string
  year: string
  genre: string
  duration: number
  /** Small artwork for the list */
  thumb: string
  /** Large artwork (1000px) to use as the cover */
  artwork: string
}

export interface PlaylistEntry {
  url: string
  title: string
  channel: string
  duration: number
  thumbnail: string
}

export interface PlaylistInfo {
  title: string
  channel: string
  entries: PlaylistEntry[]
  /** True when the list was cut at the maximum size */
  truncated: boolean
}

export interface MedleyRequest {
  jobId: string
  songIds: string[]
  /** Crossfade between songs in seconds (0 = back to back) */
  crossfade: number
  /** Level every song to the same loudness first */
  normalize: boolean
  /** Fade out the last song */
  fadeOut: boolean
  title: string
  artist: string
  album: string
}

export type UpdateStatus = 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error' | 'dev'

export interface UpdateState {
  status: UpdateStatus
  current: string
  version?: string
  percent?: number
  error?: string
}

export interface SearchResult {
  id: string
  url: string
  title: string
  channel: string
  duration: number
  thumbnail: string
  views?: number
}

export interface Marker {
  id: string
  time: number
  label: string
}

/** Auto-saved editor state for a source, so unfinished work can be resumed. */
export interface Session {
  sourceId: string
  url: string
  title: string
  channel: string
  duration: number
  thumbnailPath: string | null
  drafts: unknown[]
  markers: Marker[]
  clipCount: number
  forgedCount: number
  updatedAt: number
}
