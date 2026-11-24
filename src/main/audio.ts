import { copyFileSync, existsSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { CLIP_DEFAULTS, FX_DEFAULTS, type ClipSettings, type ExportRequest, type FxSettings, type Song, type SongMeta } from '@shared/types'
import { impulseWav, reverbMix } from '@shared/reverb'
import { parseLrc } from '@shared/lrc'
import { ensureDir, getLibrary, getSettings, mutateLibrary, paths } from './store'
import { demucsStatus, ffmpegPath, run } from './tools'
import { translateLyrics } from './translate'

type Progress = (stage: string, percent: number, detail?: string) => void

export function sanitizeFilename(s: string): string {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim().slice(0, 120) || 'Untitled'
}

export function uniquePath(dir: string, base: string, ext: string, keep?: string): string {
  let p = join(dir, `${base}${ext}`)
  let i = 2
  while (existsSync(p) && resolve(p) !== (keep && resolve(keep))) p = join(dir, `${base} (${i++})${ext}`)
  return p
}

/** The .lrc file that sits next to an MP3, for players that show synced lyrics. */
export const lrcPathFor = (mp3: string) => mp3.replace(/\.[^.\\/]+$/, '') + '.lrc'

/** Write, move or remove the .lrc sidecar so it always matches the MP3. */
function syncLrc(mp3: string, synced: string | undefined, previousMp3?: string) {
  if (previousMp3 && resolve(previousMp3) !== resolve(mp3)) rmSync(lrcPathFor(previousMp3), { force: true })
  if (synced?.trim()) writeFileSync(lrcPathFor(mp3), synced.trim() + '\r\n', 'utf8')
  else rmSync(lrcPathFor(mp3), { force: true })
}

export function metadataArgs(meta: SongMeta, sourceUrl: string): string[] {
  const kv: Record<string, string> = {
    title: meta.title,
    artist: meta.artist,
    album_artist: meta.artist,
    album: meta.album,
    date: meta.year,
    genre: meta.genre,
    lyrics: meta.lyrics,
    comment: /^https?:/.test(sourceUrl) ? `Forged with SongForge from ${sourceUrl}` : 'Forged with SongForge',
    encoded_by: 'SongForge'
  }
  return Object.entries(kv).flatMap(([k, v]) => (v ? ['-metadata', `${k}=${v}`] : []))
}

export const coverArgs = ['-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic', '-metadata:s:v', 'title=Album cover', '-metadata:s:v', 'comment=Cover (front)']

/** Persist a cover (data URL or existing path) into the app's covers folder. */
export function storeCover(songId: string, cover: string | null): string | null {
  if (!cover) return null
  const dest = join(paths.covers, `${songId}.jpg`)
  if (cover.startsWith('data:')) {
    writeFileSync(dest, Buffer.from(cover.split(',')[1], 'base64'))
    return dest
  }
  if (existsSync(cover)) {
    if (resolve(cover) !== resolve(dest)) copyFileSync(cover, dest)
    return dest
  }
  return null
}

function parseProgress(totalSec: number, onPct: (p: number) => void) {
  return (line: string) => {
    const m = line.match(/^out_time_us=(\d+)/)
    if (m && totalSec > 0) onPct(Math.min(100, (Number(m[1]) / 1e6 / totalSec) * 100))
  }
}

/** Split the clip with Demucs and return the vocals or the instrumental (no_vocals) stem. */
async function separate(input: string, clip: ClipSettings, workDir: string, onProgress: Progress): Promise<string> {
  const status = await demucsStatus()
  const what = clip.cleanup === 'instrumental' ? 'Instrumental export' : 'Vocal isolation'
  if (!status.ok || !status.python) throw new Error(`${what} needs Demucs. Install it from Settings → Tools.`)
  onProgress('Preparing vocal isolation', 5)
  const seg = join(workDir, 'segment.wav')
  const cut = await run(ffmpegPath(), ['-y', '-v', 'error', '-ss', String(clip.start), '-t', String(clip.end - clip.start), '-i', input, '-ac', '2', '-ar', '44100', seg])
  if (cut.code !== 0) throw new Error('Could not cut segment for vocal isolation')
  const r = await run(status.python, ['-m', 'demucs', '--two-stems=vocals', '-n', 'htdemucs', '-o', workDir, seg], {
    onLine: (l) => {
      const m = l.match(/(\d+)%\|/)
      if (m) onProgress(clip.cleanup === 'instrumental' ? 'Removing vocals (AI)' : 'Isolating vocals (AI)', 5 + Number(m[1]) * 0.6)
    }
  })
  const stem = join(workDir, 'htdemucs', 'segment', clip.cleanup === 'instrumental' ? 'no_vocals.wav' : 'vocals.wav')
  if (r.code !== 0 || !existsSync(stem)) throw new Error('Demucs failed: ' + r.stderr.split(/\r?\n/).filter(Boolean).pop())
  return stem
}

/** EQ filters matching the live preview (low shelf 110 Hz, bell 2.2 kHz, high shelf 7 kHz). */
function eqFilters(fx: FxSettings): string[] {
  const f: string[] = []
  if (fx.bass) f.push(`bass=g=${fx.bass.toFixed(1)}:f=110:w=0.6`)
  if (fx.mid) f.push(`equalizer=f=2200:t=q:w=0.9:g=${fx.mid.toFixed(1)}`)
  if (fx.treble) f.push(`treble=g=${fx.treble.toFixed(1)}:f=7000:w=0.6`)
  return f
}

export async function exportSong(req: ExportRequest, onProgress: Progress): Promise<Song> {
  const settings = getSettings()
  const outDir = ensureDir(settings.outputDir)
  const existing = req.songId ? getLibrary().songs.find((s) => s.id === req.songId) : undefined
  const id = existing?.id ?? randomUUID()
  const workDir = ensureDir(join(paths.tmp, id))
  const { meta } = req
  const clip: ClipSettings = { ...CLIP_DEFAULTS, ...req.clip, fx: { ...FX_DEFAULTS, ...req.clip.fx } }
  const { fx } = clip
  const separating = clip.cleanup === 'vocals' || clip.cleanup === 'instrumental'
  const length = Math.max(0.1, clip.end - clip.start)
  const speed = Math.min(2, Math.max(0.5, clip.speed || 1))
  const outLength = length / speed

  try {
    let input = req.source.audioPath
    let start = clip.start
    if (separating) {
      input = await separate(req.source.audioPath, clip, workDir, onProgress)
      start = 0
    }

    // Before the reverb: timing, cleanup and tone
    const pre: string[] = ['aresample=44100', 'aformat=channel_layouts=stereo']
    if (clip.pitch !== 0 || speed !== 1) {
      const ratio = Math.pow(2, clip.pitch / 12)
      pre.push(`rubberband=tempo=${speed.toFixed(4)}:pitch=${ratio.toFixed(6)}:pitchq=quality:formant=preserved:transients=smooth`)
    }
    if (clip.cleanup === 'denoise') pre.push('highpass=f=70', 'afftdn=nf=-25:tn=1')
    pre.push(...eqFilters(fx))
    // After the reverb: loudness, gain and fades
    const post: string[] = []
    if (clip.normalize) post.push('loudnorm=I=-14:TP=-1.0:LRA=11')
    if (clip.gain) post.push(`volume=${clip.gain.toFixed(1)}dB`)
    if (clip.fadeIn > 0) post.push(`afade=t=in:st=0:d=${clip.fadeIn}`)
    if (clip.fadeOut > 0) post.push(`afade=t=out:st=${Math.max(0, outLength - clip.fadeOut).toFixed(3)}:d=${clip.fadeOut}`)
    if (clip.gain > 0 || fx.bass > 0 || fx.mid > 0 || fx.treble > 0 || fx.reverb > 0) post.push('alimiter=limit=0.97:level=false')

    const coverPath = storeCover(id, req.cover)
    const base = sanitizeFilename(meta.artist ? `${meta.artist} - ${meta.title}` : meta.title)
    const finalPath = uniquePath(outDir, base, '.mp3', existing?.filePath)
    const tmpOut = join(workDir, 'out.mp3')

    const args = ['-y', '-v', 'error', '-nostats', '-progress', 'pipe:1', '-ss', String(start), '-t', String(length), '-i', input]
    let next = 1
    let irIndex = -1
    if (fx.reverb > 0) {
      const ir = join(workDir, 'impulse.wav')
      writeFileSync(ir, impulseWav(fx.room))
      args.push('-i', ir)
      irIndex = next++
    }
    const coverIndex = coverPath ? next++ : -1
    if (coverPath) args.push('-i', coverPath)

    if (irIndex >= 0) {
      const { dry, wet } = reverbMix(fx.reverb)
      const graph =
        `[0:a]${pre.join(',')},asplit=2[dry][wetin];` +
        `[wetin][${irIndex}:a]afir=dry=1:wet=1[wetraw];` +
        `[dry]volume=${dry.toFixed(3)}[d];[wetraw]volume=${wet.toFixed(3)}[w];` +
        `[d][w]amix=inputs=2:normalize=0:duration=first${post.length ? ',' + post.join(',') : ''}[out]`
      args.push('-filter_complex', graph, '-map', '[out]')
    } else {
      args.push('-map', '0:a:0', '-af', [...pre, ...post].join(','))
    }
    if (coverPath) args.push('-map', `${coverIndex}:v:0`, ...coverArgs)
    args.push('-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', `${settings.bitrate}k`, '-ar', '44100', '-id3v2_version', '3', '-write_id3v1', '1')
    args.push(...metadataArgs(meta, req.source.url), tmpOut)

    const base0 = separating ? 65 : 5
    const r = await run(ffmpegPath(), args, {
      onLine: parseProgress(outLength, (p) => onProgress('Encoding MP3', base0 + p * ((95 - base0) / 100)))
    })
    if (r.code !== 0) throw new Error('ffmpeg failed: ' + r.stderr.trim().split(/\r?\n/).pop())

    if (existing && existing.filePath !== finalPath && existsSync(existing.filePath)) rmSync(existing.filePath)
    if (existsSync(finalPath)) rmSync(finalPath)
    renameSync(tmpOut, finalPath)
    syncLrc(finalPath, meta.syncedLyrics, existing?.filePath)

    const now = Date.now()
    const song: Song = {
      id,
      ...meta,
      ...clip,
      filePath: finalPath,
      coverPath,
      duration: outLength,
      sourceUrl: req.source.url,
      sourceId: req.source.id,
      sourceTitle: req.source.title,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      versionGroup: existing?.versionGroup,
      lyricsOffset: existing?.lyricsOffset,
      imported: existing?.imported,
      importedFrom: existing?.importedFrom
    }
    mutateLibrary((lib) => {
      const i = lib.songs.findIndex((s) => s.id === id)
      if (i >= 0) lib.songs[i] = song
      else lib.songs.unshift(song)
    })
    onProgress('Saved', 100)
    return song
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

/** Rewrite tags/cover on an existing MP3 without re-encoding audio. */
export async function retagSong(songId: string, meta: SongMeta, cover: string | null): Promise<Song> {
  const song = getLibrary().songs.find((s) => s.id === songId)
  if (!song) throw new Error('Song not found')
  if (!existsSync(song.filePath)) throw new Error('The MP3 file is missing from disk')
  const coverPath = cover === song.coverPath ? song.coverPath : storeCover(songId, cover)
  const workDir = ensureDir(join(paths.tmp, songId + '-tag'))
  const tmpOut = join(workDir, 'out.mp3')
  try {
    const args = ['-y', '-v', 'error', '-i', song.filePath]
    if (coverPath) args.push('-i', coverPath)
    args.push('-map', '0:a:0')
    if (coverPath) args.push('-map', '1:v:0', ...coverArgs)
    args.push('-c:a', 'copy', '-map_metadata', '-1', '-id3v2_version', '3', '-write_id3v1', '1', ...metadataArgs(meta, song.sourceUrl), tmpOut)
    const r = await run(ffmpegPath(), args)
    if (r.code !== 0) throw new Error('ffmpeg failed: ' + r.stderr.trim().split(/\r?\n/).pop())

    const dir = getSettings().outputDir
    const base = sanitizeFilename(meta.artist ? `${meta.artist} - ${meta.title}` : meta.title)
    const finalPath = uniquePath(ensureDir(dir), base, '.mp3', song.filePath)
    rmSync(song.filePath)
    renameSync(tmpOut, finalPath)
    syncLrc(finalPath, meta.syncedLyrics, song.filePath)

    const updated: Song = { ...song, ...meta, coverPath, filePath: finalPath, updatedAt: Date.now() }
    mutateLibrary((lib) => {
      lib.songs = lib.songs.map((s) => (s.id === songId ? updated : s))
    })
    return updated
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

export function deleteSong(songId: string, deleteFile: boolean): void {
  const song = getLibrary().songs.find((s) => s.id === songId)
  if (!song) return
  if (deleteFile && existsSync(song.filePath)) {
    rmSync(song.filePath)
    rmSync(lrcPathFor(song.filePath), { force: true })
  }
  if (song.coverPath && existsSync(song.coverPath)) rmSync(song.coverPath)
  mutateLibrary((lib) => {
    lib.songs = lib.songs.filter((s) => s.id !== songId)
    for (const p of lib.playlists) p.songIds = p.songIds.filter((id) => id !== songId)
  })
}

/** Update library-only fields that don't touch the MP3 (version stacking, lyrics timing). */
/** Lyric lines of a song, for translating */
function lyricLines(s: Song): string[] {
  return s.syncedLyrics?.trim() ? parseLrc(s.syncedLyrics).map((l) => l.text) : s.lyrics.split(/\r?\n/)
}

/** Translate a song's lyrics once and keep the result with the song. */
export async function translateSongLyrics(songId: string): Promise<Song | null> {
  const song = getLibrary().songs.find((s) => s.id === songId)
  if (!song) return null
  const to = getSettings().translateTo || 'en'
  const key = createHash('sha1').update(song.syncedLyrics || song.lyrics).digest('hex').slice(0, 12)
  if (song.lyricsExtra?.key === key && song.lyricsExtra.to === to) return song
  const extra = { ...(await translateLyrics(lyricLines(song), to)), key }
  let out: Song | null = null
  mutateLibrary((lib) => {
    const s = lib.songs.find((x) => x.id === songId)
    if (!s) return
    s.lyricsExtra = extra
    out = s
  })
  return out
}

export function patchSong(songId: string, patch: Pick<Partial<Song>, 'versionGroup' | 'lyricsOffset'>): Song | null {
  let out: Song | null = null
  mutateLibrary((lib) => {
    const s = lib.songs.find((x) => x.id === songId)
    if (!s) return
    if ('versionGroup' in patch) s.versionGroup = patch.versionGroup || undefined
    if ('lyricsOffset' in patch) s.lyricsOffset = patch.lyricsOffset || undefined
    out = s
  })
  return out
}

/**
 * Keep one copy of a duplicated song and remove the others. Playlists that held a removed copy
 * get the kept one instead, so nothing disappears from a playlist.
 */
export function mergeSongs(keepId: string, removeIds: string[]): void {
  const lib = getLibrary()
  const keep = lib.songs.find((s) => s.id === keepId)
  if (!keep) throw new Error('Song not found')
  const doomed = lib.songs.filter((s) => removeIds.includes(s.id) && s.id !== keepId)
  for (const s of doomed) {
    // Never delete the file the kept song uses
    if (resolve(s.filePath) !== resolve(keep.filePath) && existsSync(s.filePath)) {
      rmSync(s.filePath)
      rmSync(lrcPathFor(s.filePath), { force: true })
    }
    if (s.coverPath && s.coverPath !== keep.coverPath && existsSync(s.coverPath)) rmSync(s.coverPath)
  }
  const gone = new Set(doomed.map((s) => s.id))
  mutateLibrary((l) => {
    l.songs = l.songs.filter((s) => !gone.has(s.id))
    for (const p of l.playlists) p.songIds = [...new Set(p.songIds.map((id) => (gone.has(id) ? keepId : id)))]
  })
}

export function exportM3U(playlistId: string, dest: string): void {
  const lib = getLibrary()
  const pl = lib.playlists.find((p) => p.id === playlistId)
  if (!pl) throw new Error('Playlist not found')
  const lines = ['#EXTM3U', `#PLAYLIST:${pl.name}`]
  for (const id of pl.songIds) {
    const s = lib.songs.find((x) => x.id === id)
    if (!s) continue
    lines.push(`#EXTINF:${Math.round(s.duration)},${s.artist} - ${s.title}`, s.filePath)
  }
  writeFileSync(dest, lines.join('\r\n') + '\r\n', 'utf8')
}
