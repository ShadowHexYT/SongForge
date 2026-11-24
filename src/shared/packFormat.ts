import { CLIP_DEFAULTS, FX_DEFAULTS, type Cleanup, type FxSettings, type Song } from './types'

/** Names a song pack may contain. Anything else in the zip is ignored. */
export const PACK_ENTRY = /^songs\/\d{4}\.(mp3|jpg)$/

// Values in a pack come from someone else's PC, so every field is checked and coerced
export const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '')
export const num = (v: unknown, lo: number, hi: number, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const CLEANUPS: Cleanup[] = ['none', 'denoise', 'vocals', 'instrumental']
export const isWeb = (u: string) => /^https?:\/\//i.test(u)

export type PackSongFields = Omit<Song, 'id' | 'filePath' | 'coverPath' | 'duration' | 'sourceUrl' | 'sourceId' | 'createdAt' | 'updatedAt'> & {
  /** Public web link, or '' when the pack had none */
  sourceUrl: string
}

/** Turn one untrusted pack.json song entry into safe song fields. */
export function packSongFields(raw: unknown, packName: string, duration: number): PackSongFields {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const fx = (p.fx && typeof p.fx === 'object' ? p.fx : {}) as Partial<Record<keyof FxSettings, unknown>>
  const link = str(p.sourceUrl, 2000)
  const synced = str(p.syncedLyrics, 100_000).trim()
  return {
    title: str(p.title, 200).trim() || 'Untitled',
    artist: str(p.artist, 200).trim(),
    album: str(p.album, 200),
    year: str(p.year, 4).replace(/\D/g, ''),
    genre: str(p.genre, 80),
    lyrics: str(p.lyrics, 100_000),
    syncedLyrics: synced || undefined,
    start: num(p.start, 0, 24 * 3600),
    end: num(p.end, 0, 24 * 3600, duration),
    fadeIn: num(p.fadeIn, 0, 30),
    fadeOut: num(p.fadeOut, 0, 30),
    normalize: p.normalize === true,
    cleanup: CLEANUPS.includes(p.cleanup as Cleanup) ? (p.cleanup as Cleanup) : 'none',
    gain: num(p.gain, -24, 24, CLIP_DEFAULTS.gain),
    pitch: num(p.pitch, -12, 12, CLIP_DEFAULTS.pitch),
    speed: num(p.speed, 0.5, 2, CLIP_DEFAULTS.speed),
    fx: {
      bass: num(fx.bass, -12, 12, FX_DEFAULTS.bass),
      mid: num(fx.mid, -12, 12, FX_DEFAULTS.mid),
      treble: num(fx.treble, -12, 12, FX_DEFAULTS.treble),
      reverb: num(fx.reverb, 0, 1, FX_DEFAULTS.reverb),
      room: num(fx.room, 0, 1, FX_DEFAULTS.room)
    },
    sourceUrl: isWeb(link) ? link : '',
    sourceTitle: (isWeb(link) && str(p.sourceTitle, 300)) || `${packName} (song pack)`,
    versionGroup: str(p.versionGroup, 200) || undefined,
    lyricsOffset: num(p.lyricsOffset, -60, 60) || undefined,
    imported: true,
    fromPack: packName
  }
}
