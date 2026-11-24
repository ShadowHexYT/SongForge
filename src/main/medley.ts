import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { CLIP_DEFAULTS, type MedleyRequest, type Song } from '@shared/types'
import { ensureDir, getLibrary, getSettings, mutateLibrary, paths } from './store'
import { ffmpegPath, run } from './tools'
import { coverArgs, metadataArgs, sanitizeFilename, uniquePath } from './audio'
import { probeDuration } from './youtube'

type Progress = (stage: string, percent: number, detail?: string) => void

/** Join songs into one track, with crossfades between them. */
export async function makeMedley(req: MedleyRequest, onProgress: Progress): Promise<Song> {
  const lib = getLibrary()
  const songs = req.songIds.map((id) => lib.songs.find((s) => s.id === id)).filter((s): s is Song => !!s && existsSync(s.filePath))
  if (songs.length < 2) throw new Error('Pick at least two songs for a medley.')
  const settings = getSettings()
  const outDir = ensureDir(settings.outputDir)
  const id = randomUUID()
  const workDir = ensureDir(join(paths.tmp, id))

  try {
    onProgress('Reading songs', 2)
    const lengths = await Promise.all(songs.map(async (s) => (await probeDuration(s.filePath)) || s.duration))
    const xf = Math.min(10, Math.max(0, req.crossfade || 0))
    // A crossfade can't be longer than either song it joins
    const fades = lengths.slice(1).map((len, i) => (xf > 0 ? Math.max(0.1, Math.min(xf, len * 0.4, lengths[i] * 0.4)) : 0))
    const total = lengths.reduce((a, b) => a + b, 0) - fades.reduce((a, b) => a + b, 0)

    const parts: string[] = songs.map(
      (_, i) =>
        `[${i}:a]aformat=sample_fmts=fltp:channel_layouts=stereo${req.normalize ? ',loudnorm=I=-14:TP=-1.5:LRA=11' : ''},aresample=44100[s${i}]`
    )
    let last = 's0'
    if (xf > 0) {
      for (let i = 1; i < songs.length; i++) {
        parts.push(`[${last}][s${i}]acrossfade=d=${fades[i - 1].toFixed(2)}:c1=tri:c2=tri[m${i}]`)
        last = `m${i}`
      }
    } else {
      parts.push(`${songs.map((_, i) => `[s${i}]`).join('')}concat=n=${songs.length}:v=0:a=1[m]`)
      last = 'm'
    }
    const tail = req.fadeOut ? `afade=t=out:st=${Math.max(0, total - 3).toFixed(2)}:d=3,` : ''
    parts.push(`[${last}]${tail}alimiter=limit=0.97:level=false[out]`)

    const coverSrc = songs.find((s) => s.coverPath && existsSync(s.coverPath))?.coverPath ?? null
    const coverPath = coverSrc ? join(paths.covers, `${id}.jpg`) : null
    if (coverSrc && coverPath) copyFileSync(coverSrc, coverPath)

    const title = req.title.trim() || 'Medley'
    const artist = req.artist.trim()
    const genres = [...new Set(songs.map((s) => s.genre).filter(Boolean))]
    const meta = {
      title,
      artist,
      album: req.album.trim(),
      year: String(new Date().getFullYear()),
      genre: genres.length === 1 ? genres[0] : '',
      lyrics: ''
    }

    const args = ['-y', '-v', 'error', '-nostats', '-progress', 'pipe:1']
    for (const s of songs) args.push('-i', s.filePath)
    if (coverPath) args.push('-i', coverPath)
    args.push('-filter_complex', parts.join(';'), '-map', '[out]')
    if (coverPath) args.push('-map', `${songs.length}:v:0`, ...coverArgs)
    const tmpOut = join(workDir, 'out.mp3')
    args.push('-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', `${settings.bitrate}k`, '-ar', '44100', '-id3v2_version', '3', '-write_id3v1', '1')
    args.push(...metadataArgs(meta, ''), tmpOut)

    const r = await run(ffmpegPath(), args, {
      onLine: (l) => {
        const m = l.match(/^out_time_us=(\d+)/)
        if (m && total > 0) onProgress('Mixing medley', 5 + Math.min(100, (Number(m[1]) / 1e6 / total) * 100) * 0.93)
      }
    })
    if (r.code !== 0) throw new Error('ffmpeg failed: ' + r.stderr.trim().split(/\r?\n/).pop())

    const filePath = uniquePath(outDir, sanitizeFilename(artist ? `${artist} - ${title}` : title), '.mp3')
    renameSync(tmpOut, filePath)
    const duration = (await probeDuration(filePath)) || total
    const now = Date.now()
    const song: Song = {
      id,
      ...meta,
      start: 0,
      end: duration,
      fadeIn: 0,
      fadeOut: 0,
      normalize: req.normalize,
      cleanup: 'none',
      ...CLIP_DEFAULTS,
      filePath,
      coverPath,
      duration,
      sourceUrl: pathToFileURL(filePath).href,
      sourceId: '',
      sourceTitle: `Medley of ${songs.length} songs: ${songs.map((s) => s.title).join(', ')}`.slice(0, 300),
      createdAt: now,
      updatedAt: now,
      medleyOf: songs.map((s) => s.id)
    }
    mutateLibrary((l) => {
      l.songs.unshift(song)
    })
    onProgress('Saved', 100)
    return song
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}
