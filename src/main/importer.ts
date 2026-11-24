import { copyFileSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { CLIP_DEFAULTS, type ImportResult, type Song, type SongMeta } from '@shared/types'
import { guessFromTitle } from '@shared/parseTitle'
import { isLrc, lrcToPlain } from '@shared/lrc'
import { ensureDir, getLibrary, getSettings, mutateLibrary, paths } from './store'
import { ffmpegPath, run } from './tools'
import { AUDIO_EXT, extractImage, probeDuration } from './youtube'
import { coverArgs, lrcPathFor, metadataArgs, sanitizeFilename, uniquePath } from './audio'

type Progress = (stage: string, percent: number, detail?: string) => void

/** Expand folders (two levels deep) into the audio files they contain. */
function collect(inputs: string[]): string[] {
  const out: string[] = []
  const walk = (p: string, depth: number) => {
    let st
    try {
      st = statSync(p)
    } catch {
      return
    }
    if (st.isDirectory()) {
      if (depth > 2) return
      for (const n of readdirSync(p)) walk(join(p, n), depth + 1)
    } else if (AUDIO_EXT.includes(extname(p).toLowerCase())) out.push(p)
  }
  for (const i of inputs) walk(i, 0)
  return [...new Set(out)]
}

/** Read tags with ffmpeg's ffmetadata muxer (no extra dependencies). */
async function readTags(file: string): Promise<Record<string, string>> {
  const r = await run(ffmpegPath(), ['-v', 'error', '-i', file, '-f', 'ffmetadata', '-'])
  const tags: Record<string, string> = {}
  // Values escape '=', ';', '#', '\' and newlines with a backslash
  const lines = r.stdout.replace(/\\\r?\n/g, '\u0000').split(/\r?\n/)
  for (const line of lines) {
    if (!line || line.startsWith(';') || line.startsWith('[')) continue
    const m = line.match(/^((?:[^=\\]|\\.)+)=(.*)$/)
    if (!m) continue
    const key = m[1].replace(/\\(.)/g, '$1').toLowerCase()
    const val = m[2].replace(/\\(.)/g, '$1').replace(/\u0000/g, '\n').trim()
    if (val && !(key in tags)) tags[key] = val
  }
  return tags
}

function metaFrom(tags: Record<string, string>, file: string): SongMeta {
  const lyricsKey = Object.keys(tags).find((k) => k === 'lyrics' || k.startsWith('lyrics-') || k === 'unsyncedlyrics')
  let lyrics = lyricsKey ? tags[lyricsKey] : ''
  let synced = ''
  if (isLrc(lyrics)) {
    synced = lyrics
    lyrics = lrcToPlain(lyrics)
  }
  const sidecar = lrcPathFor(file)
  if (!synced && existsSync(sidecar)) {
    synced = readFileSync(sidecar, 'utf8')
    if (!lyrics) lyrics = lrcToPlain(synced)
  }
  let title = tags.title ?? ''
  let artist = tags.artist ?? tags.album_artist ?? ''
  if (!title) {
    const g = guessFromTitle(basename(file, extname(file)))
    title = g.title
    artist ||= g.artist
  }
  return {
    title,
    artist,
    album: tags.album ?? '',
    year: (tags.date ?? tags.year ?? '').slice(0, 4),
    genre: tags.genre ?? '',
    lyrics,
    syncedLyrics: synced || undefined
  }
}

const inside = (file: string, dir: string) => resolve(file).toLowerCase().startsWith(resolve(dir).toLowerCase() + '\\')

/**
 * Add existing songs to the library. MP3s are copied into the SongForge folder (so Spotify sees
 * them); other formats are converted to MP3. Files already in that folder are used in place.
 */
export async function importSongs(inputs: string[], onProgress: Progress): Promise<ImportResult> {
  const settings = getSettings()
  const outDir = ensureDir(settings.outputDir)
  const files = collect(inputs)
  const key = (p: string) => resolve(p).toLowerCase()
  const known = new Set(getLibrary().songs.flatMap((s) => [key(s.filePath), ...(s.importedFrom ? [key(s.importedFrom)] : [])]))
  const result: ImportResult = { added: 0, skipped: 0, errors: [] }
  const added: Song[] = []

  for (const [i, file] of files.entries()) {
    onProgress('Importing', (i / Math.max(1, files.length)) * 100, basename(file))
    if (known.has(key(file))) {
      result.skipped++
      continue
    }
    try {
      const id = randomUUID()
      const tags = await readTags(file)
      const meta = metaFrom(tags, file)
      const cover = join(paths.covers, `${id}.jpg`)
      const coverPath = (await extractImage(file, cover)) ? cover : null
      const ext = extname(file).toLowerCase()
      const base = sanitizeFilename(meta.artist ? `${meta.artist} - ${meta.title}` : meta.title)
      let filePath: string

      if (ext === '.mp3' && inside(file, outDir)) {
        filePath = file
      } else if (ext === '.mp3') {
        filePath = uniquePath(outDir, base, '.mp3')
        copyFileSync(file, filePath)
      } else {
        const workDir = ensureDir(join(paths.tmp, id))
        const tmpOut = join(workDir, 'out.mp3')
        try {
          const args = ['-y', '-v', 'error', '-i', file]
          if (coverPath) args.push('-i', coverPath)
          args.push('-map', '0:a:0')
          if (coverPath) args.push('-map', '1:v:0', ...coverArgs)
          args.push('-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', `${settings.bitrate}k`, '-ar', '44100', '-id3v2_version', '3', '-write_id3v1', '1')
          args.push(...metadataArgs(meta, ''), tmpOut)
          const r = await run(ffmpegPath(), args)
          if (r.code !== 0) throw new Error(r.stderr.trim().split(/\r?\n/).pop() || 'conversion failed')
          filePath = uniquePath(outDir, base, '.mp3')
          renameSync(tmpOut, filePath)
        } finally {
          rmSync(workDir, { recursive: true, force: true })
        }
      }
      if (meta.syncedLyrics && !existsSync(lrcPathFor(filePath))) writeFileSync(lrcPathFor(filePath), meta.syncedLyrics, 'utf8')
      const duration = await probeDuration(filePath)
      const now = Date.now()
      added.push({
        id,
        ...meta,
        start: 0,
        end: duration,
        fadeIn: 0,
        fadeOut: 0,
        normalize: false,
        cleanup: 'none',
        ...CLIP_DEFAULTS,
        filePath,
        coverPath,
        duration,
        sourceUrl: pathToFileURL(filePath).href,
        sourceId: '',
        sourceTitle: basename(file),
        createdAt: now,
        updatedAt: now,
        imported: true,
        importedFrom: file
      })
      known.add(key(filePath))
      known.add(key(file))
      result.added++
    } catch (e) {
      result.errors.push(`${basename(file)}: ${(e as Error).message}`)
    }
  }
  if (added.length) mutateLibrary((lib) => lib.songs.unshift(...added.reverse()))
  onProgress('Done', 100)
  return result
}
