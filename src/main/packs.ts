import { app } from 'electron'
import { createWriteStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { Zip, ZipPassThrough, strFromU8, strToU8 } from 'fflate'
import type { Cleanup, FxSettings, ImportResult, Song } from '@shared/types'
import { PACK_ENTRY, isWeb, num, packSongFields, str } from '@shared/packFormat'
import { ensureDir, getLibrary, getSettings, mutateLibrary, paths } from './store'
import { lrcPathFor, sanitizeFilename, uniquePath } from './audio'
import { probeDuration } from './youtube'
import { openZip, type ZipReader } from './zipread'

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

function readEntry(zip: ZipReader, name: string): Uint8Array | null {
  if (!PACK_ENTRY.test(name) && name !== 'pack.json') return null
  return zip.read(name)
}

export async function importPack(file: string, onProgress: Progress, result: ImportResult): Promise<void> {
  const notPack = () => result.errors.push(`${file.split(/[\\/]/).pop()}: not a SongForge song pack`)
  let data: ZipReader
  try {
    data = openZip(file)
  } catch {
    notPack()
    return
  }
  try {
    let manifest: PackManifest
    try {
      const raw = readEntry(data, 'pack.json')
      manifest = JSON.parse(raw ? strFromU8(raw) : '{}')
    } catch {
      notPack()
      return
    }
    if (manifest?.format !== FORMAT || !Array.isArray(manifest.songs)) {
      notPack()
      return
    }
    await importSongs(data, manifest, onProgress, result)
  } finally {
    data.close()
  }
}

async function importSongs(data: ZipReader, manifest: PackManifest, onProgress: Progress, result: ImportResult): Promise<void> {
  const packName = str(manifest.name, 80).trim() || 'Song pack'
  const outDir = ensureDir(getSettings().outputDir)
  const existing = getLibrary().songs
  const sameSong = (s: Song, title: string, artist: string, duration: number) =>
    s.title.toLowerCase() === title.toLowerCase() && s.artist.toLowerCase() === artist.toLowerCase() && Math.abs(s.duration - duration) < 1.5
  const added: Song[] = []
  const playlistIds: string[] = []
  const list = manifest.songs.slice(0, MAX_SONGS)

  for (const [i, p] of list.entries()) {
    const declared = num((p as { duration?: unknown })?.duration, 0, 24 * 3600)
    const meta = packSongFields(p, packName, declared)
    const { title, artist } = meta
    onProgress('Importing pack', (i / Math.max(1, list.length)) * 100, title)
    try {
      const dupe = [...existing, ...added].find((s) => sameSong(s, title, artist, declared))
      if (dupe) {
        result.skipped++
        playlistIds.push(dupe.id)
        continue
      }
      const file = str(p?.file)
      const mp3 = file.endsWith('.mp3') ? readEntry(data, file) : null
      if (!mp3) throw new Error('song file missing from the pack')
      const id = randomUUID()
      const filePath = uniquePath(outDir, sanitizeFilename(artist ? `${artist} - ${title}` : title), '.mp3')
      writeFileSync(filePath, mp3)
      let coverPath: string | null = null
      const cover = str(p?.cover)
      const img = cover.endsWith('.jpg') ? readEntry(data, cover) : null
      if (img) {
        coverPath = join(paths.covers, `${id}.jpg`)
        writeFileSync(coverPath, img)
      }
      if (meta.syncedLyrics) writeFileSync(lrcPathFor(filePath), `${meta.syncedLyrics}\r\n`, 'utf8')
      const duration = (await probeDuration(filePath)) || declared
      const fields = packSongFields(p, packName, duration)
      const now = Date.now()
      const song: Song = {
        ...fields,
        id,
        filePath,
        coverPath,
        duration,
        sourceUrl: fields.sourceUrl || pathToFileURL(filePath).href,
        sourceId: '',
        createdAt: now,
        updatedAt: now
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
