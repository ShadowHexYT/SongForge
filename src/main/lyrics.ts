import type { LyricsResult } from '@shared/types'

/**
 * Lyrics come from LRCLIB (lrclib.net), a free, open lyrics database with time-synced lyrics.
 * Only the song title, artist and length are sent. Nothing about the user is.
 */
const BASE = 'https://lrclib.net/api'
const HEADERS = { 'User-Agent': 'SongForge/1.0 (desktop music app)' }

interface LrclibRow {
  id: number
  trackName: string
  artistName: string
  albumName: string | null
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

async function query(params: Record<string, string>): Promise<LrclibRow[]> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${BASE}/search?${qs}`, { headers: HEADERS, signal: AbortSignal.timeout(12000) })
  if (!res.ok) throw new Error(`Lyrics service error (${res.status})`)
  return (await res.json()) as LrclibRow[]
}

/** Strip version noise from titles ("Song (Live) [4K]" -> "Song") for a better match. */
const cleanTitle = (t: string) =>
  t
    .replace(/[([【][^)\]】]*[)\]】]/g, ' ')
    .replace(/\b(sped up|slowed|nightcore|reverb|instrumental|live|cover|fancam)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export async function searchLyrics(title: string, artist: string, duration?: number): Promise<LyricsResult[]> {
  const t = cleanTitle(title) || title
  let rows: LrclibRow[] = []
  try {
    if (artist) rows = await query({ track_name: t, artist_name: artist })
    if (!rows.length) rows = await query({ q: artist ? `${t} ${artist}` : t })
    if (!rows.length && artist) rows = await query({ track_name: t })
  } catch (e) {
    if ((e as Error).name === 'TimeoutError') throw new Error('The lyrics service took too long to answer. Try again.')
    throw new Error("Couldn't reach the lyrics service. Check your internet connection.")
  }
  const seen = new Set<string>()
  return rows
    .filter((r) => r.plainLyrics || r.syncedLyrics || r.instrumental)
    .map((r) => ({
      id: r.id,
      title: r.trackName,
      artist: r.artistName,
      album: r.albumName ?? '',
      duration: r.duration,
      instrumental: r.instrumental,
      plain: r.plainLyrics ?? '',
      synced: r.syncedLyrics ?? ''
    }))
    // Synced first, then the closest length to the clip
    .sort((a, b) => Number(!!b.synced) - Number(!!a.synced) || (duration ? Math.abs(a.duration - duration) - Math.abs(b.duration - duration) : 0))
    .filter((r) => {
      const k = `${r.title}|${r.artist}|${r.plain.slice(0, 80)}`.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .slice(0, 10)
}
