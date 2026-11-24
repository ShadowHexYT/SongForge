import { app } from 'electron'
import { createWriteStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { Zip, ZipPassThrough, strFromU8, strToU8, unzipSync } from 'fflate'
import { CLIP_DEFAULTS, FX_DEFAULTS, type Cleanup, type FxSettings, type ImportResult, type Song } from '@shared/types'
import { ensureDir, getLibrary, getSettings, mutateLibrary, paths } from './store'
import { lrcPathFor, sanitizeFilename, uniquePath } from './audio'
import { probeDuration } from './youtube'

/**
 * Song packs (.songforge) are zip files holding MP3s, covers and a pack.json with each song's
 * details, so a friend gets the same titles, lyrics and versions. Nothing about your PC goes in:
 * no file paths, and links only when they're public web pages.
 */
const FORMAT = 'songforge-pack'
const MAX_SONGS = 2000

interface PackSong {
  file: string
  cover?: string
  title: string
  artist: string
  album: string
  year: string
  genre: string
  lyrics: string
  syncedLyrics?: string
  duration: number
  start: number
  end: number
  fadeIn: number
  fadeOut: number
  normalize: boolean
  cleanup: Cleanup
  gain: number
  pitch: number
  speed: number
  fx: FxSettings
  versionGroup?: string
  lyricsOffset?: number
  sourceUrl?: string
  sourceTitle?: string
}

interface PackManifest {
  format: typeof FORMAT
  version: 1
  name: string
  createdAt: number
  app: string
  songs: PackSong[]
}

type Progress = (stage: string, percent: number, detail?: string) => void

const isWeb = (u: string) => /^https?:\/\//i.test(u)

export async function exportPack(songIds: string[], name: string, dest: string, onProgress: Progress): Promise<{ count: number; missing: number }> {
  const lib = getLibrary()
  const songs = songIds.map((id) => lib.songs.find((s) => s.id === id)).filter((s): s is Song => !!s)
  const out = createWriteStream(dest)
  const done = new Promise<void>((resolve, reject) => {
    out.on('finish', resolve)
    out.on('error', reject)
  })
  let zipError: Error | null = null
  const zip = new Zip((err, chunk, final) => {
    if (err) zipError = err
    else out.write(chunk)
    if (final || err) out.end()
  })
  // Wait until what's written so far reaches the disk, so big packs don't pile up in memory
  const flush = () => new Promise<void>((r) => out.write(new Uint8Array(0), () => r()))
  const add = async (file: string, data: Uint8Array) => {
    const f = new ZipPassThrough(file)
    zip.add(f)
    f.push(data, true)
    await flush()
  }

  const manifest: PackManifest = { format: FORMAT, version: 1, name, createdAt: Date.now(), app: app.getVersion(), songs: [] }
  let missing = 0
  for (const [i, s] of songs.entries()) {
    onProgress('Packing', (i / Math.max(1, songs.length)) * 100, s.title)
    if (!existsSync(s.filePath)) {
      missing++
      continue
    }
    const base = `songs/${String(manifest.songs.length + 1).padStart(4, '0')}`
    await add(`${base}.mp3`, readFileSync(s.filePath))
    let cover: string | undefined
    if (s.coverPath && existsSync(s.coverPath)) {
      cover = `${base}.jpg`
      await add(cover, readFileSync(s.coverPath))
    }
    manifest.songs.push({
      file: `${base}.mp3`,
      cover,
      title: s.title,
      artist: s.artist,
      album: s.album,
      year: s.year,
      genre: s.genre,
      lyrics: s.lyrics,
      syncedLyrics: s.syncedLyrics,
      duration: s.duration,
      start: s.start,
      end: s.end,
      fadeIn: s.fadeIn,
      fadeOut: s.fadeOut,
      normalize: s.normalize,
      cleanup: s.cleanup,
      gain: s.gain,
      pitch: s.pitch,
      speed: s.speed,
      fx: s.fx,
      versionGroup: s.versionGroup,
      lyricsOffset: s.lyricsOffset,
      sourceUrl: isWeb(s.sourceUrl) ? s.sourceUrl : undefined,
      sourceTitle: isWeb(s.sourceUrl) ? s.sourceTitle : undefined
    })
  }
  await add('pack.json', strToU8(JSON.stringify(manifest, null, 2)))
  zip.end()
  await done
  if (zipError) throw zipError
  onProgress('Done', 100)
  return { count: manifest.songs.length, missing }
}

// Values in a pack come from someone else's PC, so every field is checked and coerced
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown, lo: number, hi: number, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const CLEANUPS: Cleanup[] = ['none', 'denoise', 'vocals', 'instrumental']
const ENTRY = /^songs\/\d{4}\.(mp3|jpg)$/

function readEntry(zipData: Uint8Array, name: string): Uint8Array | null {
  if (!ENTRY.test(name) && name !== 'pack.json') return null
  const files = unzipSync(zipData, { filter: (f) => f.name === name })
  return files[name] ?? null
}

export async function importPack(file: string, onProgress: Progress, result: ImportResult): Promise<void> {
  const data = new Uint8Array(readFileSync(file))
  let manifest: PackManifest
  try {
    const raw = readEntry(data, 'pack.json')
    manifest = JSON.parse(raw ? strFromU8(raw) : '{}')
  } catch {
    result.errors.push(`${file.split(/[\\/]/).pop()}: not a SongForge song pack`)
    return
  }
  if (manifest?.format !== FORMAT || !Array.isArray(manifest.songs)) {
    result.errors.push(`${file.split(/[\\/]/).pop()}: not a SongForge song pack`)
    return
  }
  const packName = str(manifest.name, 80).trim() || 'Song pack'
  const outDir = ensureDir(getSettings().outputDir)
  const existing = getLibrary().songs
  const sameSong = (s: Song, title: string, artist: string, duration: number) =>
    s.title.toLowerCase() === title.toLowerCase() && s.artist.toLowerCase() === artist.toLowerCase() && Math.abs(s.duration - duration) < 1.5
  const added: Song[] = []
  const playlistIds: string[] = []
  const list = manifest.songs.slice(0, MAX_SONGS)

  for (const [i, p] of list.entries()) {
    const title = str(p?.title, 200).trim() || 'Untitled'
    const artist = str(p?.artist, 200).trim()
    onProgress('Importing pack', (i / Math.max(1, list.length)) * 100, title)
    try {
      const declared = num(p.duration, 0, 24 * 3600)
      const dupe = [...existing, ...added].find((s) => sameSong(s, title, artist, declared))
      if (dupe) {
        result.skipped++
        playlistIds.push(dupe.id)
        continue
      }
      const mp3 = readEntry(data, str(p.file))
      if (!mp3 || !str(p.file).endsWith('.mp3')) throw new Error('song file missing from the pack')
      const id = randomUUID()
      const filePath = uniquePath(outDir, sanitizeFilename(artist ? `${artist} - ${title}` : title), '.mp3')
      writeFileSync(filePath, mp3)
      let coverPath: string | null = null
      const img = p.cover && str(p.cover).endsWith('.jpg') ? readEntry(data, str(p.cover)) : null
      if (img) {
        coverPath = join(paths.covers, `${id}.jpg`)
        writeFileSync(coverPath, img)
      }
      const synced = str(p.syncedLyrics, 100_000).trim()
      if (synced) writeFileSync(lrcPathFor(filePath), synced + '\r\n', 'utf8')
      const duration = (await probeDuration(filePath)) || declared
      const fx = (p.fx ?? {}) as Partial<FxSettings>
      const sourceUrl = isWeb(str(p.sourceUrl, 2000)) ? str(p.sourceUrl, 2000) : pathToFileURL(filePath).href
      const now = Date.now()
      const song: Song = {
        id,
        title,
        artist,
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
        cleanup: CLEANUPS.includes(p.cleanup) ? p.cleanup : 'none',
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
        filePath,
        coverPath,
        duration,
        sourceUrl,
        sourceId: '',
        sourceTitle: str(p.sourceTitle, 300) || `${packName} (song pack)`,
        createdAt: now,
        updatedAt: now,
        versionGroup: str(p.versionGroup, 200) || undefined,
        lyricsOffset: num(p.lyricsOffset, -60, 60) || undefined,
        imported: true,
        fromPack: packName
      }
      added.push(song)
      playlistIds.push(id)
      result.added++
    } catch (e) {
      result.errors.push(`${title}: ${(e as Error).message}`)
    }
  }

  mutateLibrary((lib) => {
    lib.songs.unshift(...[...added].reverse())
    // A pack with several songs also arrives as a playlist with the pack's name
    // (opening the same pack again tops up that playlist instead of making a second one)
    if (playlistIds.length > 1) {
      const same = lib.playlists.find((p) => p.name === packName)
      if (same) same.songIds = [...new Set([...same.songIds, ...playlistIds])]
      else lib.playlists.push({ id: randomUUID(), name: packName, songIds: [...new Set(playlistIds)], createdAt: Date.now() })
      ;(result.playlists ??= []).push(packName)
    }
  })
}
