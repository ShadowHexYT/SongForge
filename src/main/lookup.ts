import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { TagMatch } from '@shared/types'
import { ensureDir, paths } from './store'
import { cleanTitle } from './lyrics'

/**
 * Album, year, genre and official cover art from the free iTunes Search API.
 * Only the song title and artist are sent. Nothing about the user is.
 */
interface ItunesRow {
  trackId: number
  trackName: string
  artistName: string
  collectionName?: string
  releaseDate?: string
  primaryGenreName?: string
  trackTimeMillis?: number
  artworkUrl100?: string
}

async function search(term: string): Promise<ItunesRow[]> {
  const qs = new URLSearchParams({ term, media: 'music', entity: 'song', limit: '20' })
  const res = await fetch(`https://itunes.apple.com/search?${qs}`, { signal: AbortSignal.timeout(12000) })
  if (!res.ok) throw new Error(`Music catalog error (${res.status})`)
  return ((await res.json()) as { results: ItunesRow[] }).results ?? []
}

export async function lookupTags(title: string, artist: string, duration?: number): Promise<TagMatch[]> {
  const t = cleanTitle(title) || title
  let rows: ItunesRow[] = []
  try {
    rows = await search(`${t} ${artist}`.trim())
    if (!rows.length && artist) rows = await search(t)
  } catch (e) {
    if ((e as Error).name === 'TimeoutError') throw new Error('The music catalog took too long to answer. Try again.')
    throw new Error("Couldn't reach the music catalog. Check your internet connection.")
  }
  const seen = new Set<string>()
  const want = t.toLowerCase()
  const who = artist.toLowerCase().trim()
  const byArtist = (a: TagMatch) => (who && (a.artist.toLowerCase().includes(who) || who.includes(a.artist.toLowerCase())) ? 1 : 0)
  return rows
    .filter((r) => r.trackName && r.artistName)
    .map((r) => ({
      id: r.trackId,
      title: r.trackName,
      artist: r.artistName,
      album: (r.collectionName ?? '').replace(/ - (Single|EP)$/, ''),
      year: (r.releaseDate ?? '').slice(0, 4),
      genre: r.primaryGenreName ?? '',
      duration: (r.trackTimeMillis ?? 0) / 1000,
      thumb: r.artworkUrl100 ?? '',
      artwork: (r.artworkUrl100 ?? '').replace(/\/\d+x\d+bb\.(jpg|png)$/, '/1000x1000bb.jpg')
    }))
    // The right artist first, then the exact title, then the closest length
    .sort(
      (a, b) =>
        byArtist(b) - byArtist(a) ||
        Number(b.title.toLowerCase() === want) - Number(a.title.toLowerCase() === want) ||
        (duration ? Math.abs(a.duration - duration) - Math.abs(b.duration - duration) : 0)
    )
    .filter((r) => {
      const k = `${r.title}|${r.artist}|${r.album}`.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .slice(0, 12)
}

/** Download catalog artwork to a temp file the cover editor can load. Only Apple's image host is allowed. */
export async function fetchArtwork(url: string): Promise<string> {
  const u = new URL(url)
  if (u.protocol !== 'https:' || !/(^|\.)mzstatic\.com$/.test(u.hostname)) throw new Error('Unsupported artwork address')
  const dest = join(ensureDir(join(paths.tmp, 'artwork')), createHash('sha1').update(url).digest('hex').slice(0, 16) + '.jpg')
  if (existsSync(dest)) return dest
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error("Couldn't download the cover")
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  return dest
}
