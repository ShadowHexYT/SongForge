import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import type { Chapter, PlaylistEntry, PlaylistInfo, PreparedSource, SearchResult, SourceInfo } from '@shared/types'
import { ensureDir, paths } from './store'
import { ensureYtdlp, ffmpegPath, run, ytdlpBaseArgs, ytdlpEnv, ytdlpPath } from './tools'

export function extractVideoId(url: string): string | null {
  const m =
    url.match(/(?:v=|\/shorts\/|youtu\.be\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/) ??
    url.match(/^([A-Za-z0-9_-]{11})$/)
  return m ? m[1] : null
}

/** Parse a "t=" timestamp from a YouTube URL (e.g. ?t=95 or &t=1m35s). */
export function extractStartTime(url: string): number | null {
  const m = url.match(/[?&#]t=(?:(\d+)h)?(?:(\d+)m)?(\d+)s?/)
  if (!m) return null
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0)
}

export async function fetchInfo(url: string): Promise<SourceInfo> {
  await ensureYtdlp()
  const r = await run(ytdlpPath(), [...ytdlpBaseArgs(), '-J', '--skip-download', url], { env: ytdlpEnv })
  if (r.code !== 0) throw new Error(friendlyYtError(r.stderr))
  const j = JSON.parse(r.stdout)
  // YouTube keeps its plain video id (so older caches still match); other sites get a prefix
  const extractor = String(j.extractor_key ?? j.extractor ?? '').toLowerCase()
  const id = extractor === 'youtube' || !extractor ? j.id : `${extractor}-${j.id}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)
  const chapters: Chapter[] = (j.chapters ?? []).map((c: { title: string; start_time: number; end_time: number }) => ({
    title: c.title,
    start: c.start_time,
    end: c.end_time
  }))
  return {
    id,
    url: j.webpage_url ?? url,
    title: j.title || j.description?.split('\n')[0]?.slice(0, 100) || 'Untitled',
    channel: j.channel ?? j.uploader ?? j.creator ?? '',
    uploadDate: j.upload_date ?? '',
    duration: j.duration ?? 0,
    thumbnailUrl: j.thumbnail ?? '',
    chapters,
    track: j.track ?? undefined,
    artist: j.artist ?? j.creator ?? undefined,
    album: j.album ?? undefined
  }
}

function friendlyYtError(stderr: string): string {
  const line = stderr.split(/\r?\n/).find((l) => l.includes('ERROR')) ?? stderr.trim().split(/\r?\n/).pop() ?? ''
  if (/Private video/i.test(line)) return 'This video is private.'
  if (/Sign in to confirm your age/i.test(line)) return 'This video is age-restricted and needs a signed-in account.'
  if (/not a valid URL|Unsupported URL/i.test(line)) return "SongForge can't open links from this site."
  if (/login|log in|cookies|rate-limit/i.test(line)) return 'This site wants you to be logged in to download this. Try a public post or a YouTube link.'
  if (/Video unavailable/i.test(line)) return 'This video is unavailable.'
  if (/IP address is blocked|not available in your country|geo.?restrict/i.test(line)) return "This post isn't available from your location."
  return line.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, '').replace(/^[\w-]+:\s+/, '') || 'yt-dlp failed'
}

/** True when a file has a real video track (not just embedded cover art). */
async function hasVideoStream(file: string): Promise<boolean> {
  const r = await run(ffmpegPath(), ['-hide_banner', '-i', file])
  return r.stderr.split(/\r?\n/).some((l) => /Stream #.*Video:/.test(l) && !/attached pic/.test(l))
}

function findFile(dir: string, prefix: string): string | null {
  const f = readdirSync(dir).find((n) => n.startsWith(prefix + '.') && !n.endsWith('.part') && !n.endsWith('.ytdl'))
  return f ? join(dir, f) : null
}

type Progress = (stage: string, percent: number, detail?: string) => void

async function ytDownload(url: string, dir: string, name: string, format: string, extra: string[], onPct: (p: number) => void) {
  const r = await run(
    ytdlpPath(),
    [...ytdlpBaseArgs(), '-f', format, ...extra, '-o', join(dir, `${name}.%(ext)s`), url],
    {
      env: ytdlpEnv,
      onLine: (l) => {
        const m = l.match(/\[download\]\s+(\d+(?:\.\d+)?)%/)
        if (m) onPct(Number(m[1]))
      }
    }
  )
  if (r.code !== 0) throw new Error(friendlyYtError(r.stderr))
  const f = findFile(dir, name)
  if (!f) throw new Error(`Download finished but no ${name} file was found`)
  return f
}

/** Compute waveform peaks (max abs amplitude, 0..1) by streaming PCM from ffmpeg. */
export function computePeaks(audioPath: string, perSecond = 50): Promise<number[]> {
  const rate = 8000
  const bucket = Math.round(rate / perSecond)
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath(), ['-v', 'error', '-i', audioPath, '-ac', '1', '-ar', String(rate), '-f', 's16le', 'pipe:1'], {
      windowsHide: true
    })
    const peaks: number[] = []
    let cur = 0
    let n = 0
    let carry: Buffer | null = null
    ff.stdout.on('data', (chunk: Buffer) => {
      const buf = carry ? Buffer.concat([carry, chunk]) : chunk
      const usable = buf.length - (buf.length % 2)
      carry = usable < buf.length ? buf.subarray(usable) : null
      for (let i = 0; i < usable; i += 2) {
        const v = Math.abs(buf.readInt16LE(i))
        if (v > cur) cur = v
        if (++n === bucket) {
          peaks.push(cur)
          cur = 0
          n = 0
        }
      }
    })
    ff.on('error', reject)
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error('Could not read audio for the waveform'))
      if (n) peaks.push(cur)
      let max = 1
      for (const p of peaks) if (p > max) max = p
      resolve(peaks.map((p) => Math.round((p / max) * 1000) / 1000))
    })
  })
}

const VIDEO_EXT = new Set(['.mp4', '.webm', '.m4v'])
export const AUDIO_EXT = ['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.wma']
export const LOCAL_EXT = [...AUDIO_EXT, '.mp4', '.webm', '.m4v', '.mkv', '.mov']

/** Read the duration from ffmpeg's banner. */
export async function probeDuration(file: string): Promise<number> {
  const r = await run(ffmpegPath(), ['-hide_banner', '-i', file])
  const m = r.stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0
}

/** Pull embedded cover art (or a frame for videos) into a JPEG. */
export async function extractImage(file: string, dest: string, atSecond = 0): Promise<boolean> {
  const args = ['-y', '-v', 'error']
  if (atSecond) args.push('-ss', String(atSecond))
  args.push('-i', file, '-map', '0:v:0', '-frames:v', '1', '-vf', "scale='min(1000,iw)':-2", '-q:v', '3', dest)
  const r = await run(ffmpegPath(), args)
  return r.code === 0 && existsSync(dest) && statSync(dest).size > 0
}

/**
 * Use an audio or video file from this PC as a source. The file is copied into the source cache
 * so re-clipping keeps working even after the forged MP3 replaces the original.
 */
async function prepareLocal(url: string, onProgress: Progress): Promise<PreparedSource> {
  const file = fileURLToPath(url)
  const id = 'local-' + createHash('sha1').update(file.toLowerCase()).digest('hex').slice(0, 12)
  const dir = ensureDir(join(paths.cache, id))
  const manifest = join(dir, 'source.json')
  if (existsSync(manifest)) {
    const cached = JSON.parse(readFileSync(manifest, 'utf8')) as PreparedSource
    if (existsSync(cached.audioPath)) {
      onProgress('Ready', 100)
      return cached
    }
  }
  if (!existsSync(file)) throw new Error('That file no longer exists.')
  const ext = extname(file).toLowerCase()
  if (!LOCAL_EXT.includes(ext)) throw new Error(`SongForge can't open ${ext || 'this kind of'} files.`)
  onProgress('Copying file', 10)
  const copy = join(dir, 'audio' + ext)
  copyFileSync(file, copy)
  onProgress('Reading file', 40)
  const duration = await probeDuration(copy)
  const isVideo = VIDEO_EXT.has(ext)
  const thumb = join(dir, 'thumb.jpg')
  const hasThumb = await extractImage(copy, thumb, isVideo ? Math.min(5, duration / 3) : 0)
  onProgress('Analyzing waveform', 70)
  const peaksPerSecond = 50
  const peaks = await computePeaks(copy, peaksPerSecond)
  const name = basename(file, extname(file))
  const prepared: PreparedSource = {
    id,
    url,
    title: name,
    channel: 'On this PC',
    uploadDate: '',
    duration,
    thumbnailUrl: '',
    chapters: [],
    audioPath: copy,
    videoPath: isVideo ? copy : null,
    thumbnailPath: hasThumb ? thumb : null,
    peaks,
    peaksPerSecond
  }
  writeFileSync(manifest, JSON.stringify(prepared))
  onProgress('Ready', 100)
  return prepared
}

export async function prepareSource(url: string, withVideo: boolean, onProgress: Progress): Promise<PreparedSource> {
  if (url.startsWith('file:')) return prepareLocal(url, onProgress)
  onProgress('Checking downloader', 2)
  await ensureYtdlp((p) => onProgress('Installing yt-dlp (first run)', p * 0.1))
  onProgress('Reading video info', 8)
  const info = await fetchInfo(url)
  const dir = ensureDir(join(paths.cache, info.id))
  const manifest = join(dir, 'source.json')

  if (existsSync(manifest)) {
    const cached = JSON.parse(readFileSync(manifest, 'utf8')) as PreparedSource
    if (existsSync(cached.audioPath) && (!withVideo || (cached.videoPath && existsSync(cached.videoPath)))) {
      onProgress('Ready', 100)
      return { ...cached, ...info }
    }
  }

  let audioPct = 0
  let videoPct = withVideo ? 0 : 100
  const report = () => onProgress('Downloading', 10 + ((audioPct + videoPct) / 2) * 0.75)

  // Some sites (TikTok, X, Instagram) only offer combined video+audio files, hence the "/b" fallback
  const audioJob = ytDownload(url, dir, 'audio', 'bestaudio[ext=m4a]/bestaudio/b', [], (p) => {
    audioPct = p
    report()
  })
  const videoJob = withVideo
    ? ytDownload(
        url,
        dir,
        'video',
        'b[height<=480][ext=mp4]/bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=720]/bv*[height<=720]+ba/b',
        ['--merge-output-format', 'mp4'],
        (p) => {
          videoPct = p
          report()
        }
      ).catch(() => null) // preview is optional
    : Promise.resolve(null)

  let thumbnailPath: string | null = null
  const thumbJob = (async () => {
    if (!info.thumbnailUrl) return
    try {
      const res = await fetch(info.thumbnailUrl)
      if (!res.ok) return
      const ext = (res.headers.get('content-type') ?? '').includes('webp') ? 'webp' : 'jpg'
      thumbnailPath = join(dir, `thumb.${ext}`)
      writeFileSync(thumbnailPath, Buffer.from(await res.arrayBuffer()))
    } catch {
      thumbnailPath = null
    }
  })()

  const [audioPath, downloadedVideo] = await Promise.all([audioJob, videoJob, thumbJob])
  // Audio-only sites (SoundCloud) hand back audio for the "video" too: drop it so the editor shows the artwork
  let videoPath = downloadedVideo
  if (videoPath && !(await hasVideoStream(videoPath))) {
    rmSync(videoPath, { force: true })
    videoPath = null
  }
  onProgress('Analyzing waveform', 88)
  const peaksPerSecond = 50
  const peaks = await computePeaks(audioPath, peaksPerSecond)

  const prepared: PreparedSource = { ...info, audioPath, videoPath, thumbnailPath, peaks, peaksPerSecond }
  writeFileSync(manifest, JSON.stringify(prepared))
  onProgress('Ready', 100)
  return prepared
}

export function listCachedSources(): Array<Pick<PreparedSource, 'id' | 'title' | 'channel' | 'url' | 'duration' | 'thumbnailPath'>> {
  const out = []
  for (const id of readdirSync(paths.cache)) {
    const m = join(paths.cache, id, 'source.json')
    if (!existsSync(m)) continue
    try {
      const s = JSON.parse(readFileSync(m, 'utf8')) as PreparedSource
      out.push({ id: s.id, title: s.title, channel: s.channel, url: s.url, duration: s.duration, thumbnailPath: s.thumbnailPath })
    } catch {
      /* skip corrupt */
    }
  }
  return out
}

const MAX_PLAYLIST = 500

/** List the videos in a playlist, channel or SoundCloud set without downloading them. */
export async function expandPlaylist(url: string): Promise<PlaylistInfo> {
  await ensureYtdlp()
  let target = url
  // A bare YouTube channel link lists its tabs; ask for the uploads instead
  try {
    const u = new URL(url)
    if (/youtube\.com$/.test(u.hostname) && /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/?$/.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\/?$/, '/videos')
      target = u.toString()
    }
  } catch {
    /* yt-dlp will report a bad link */
  }
  const r = await run(
    ytdlpPath(),
    ['--js-runtimes', `node:${process.execPath}`, '--flat-playlist', '-J', '--no-warnings', '--playlist-end', String(MAX_PLAYLIST + 1), target],
    { env: ytdlpEnv }
  )
  if (r.code !== 0) throw new Error(friendlyYtError(r.stderr))
  const j = JSON.parse(r.stdout)
  type Entry = {
    _type?: string
    id?: string
    url?: string
    webpage_url?: string
    title?: string
    channel?: string
    uploader?: string
    duration?: number
    ie_key?: string
    thumbnails?: Array<{ url: string; width?: number }>
    entries?: Entry[]
  }
  const flat: Entry[] = []
  const walk = (list: Entry[] | undefined) => {
    for (const e of list ?? []) {
      if (!e) continue
      if (e.entries) walk(e.entries)
      else flat.push(e)
    }
  }
  walk(j.entries)
  const entries: PlaylistEntry[] = []
  const seen = new Set<string>()
  for (const e of flat) {
    const title = e.title ?? ''
    if (/^\[(Private|Deleted) video\]$/i.test(title)) continue
    const isYt = (e.ie_key ?? '').toLowerCase() === 'youtube' || /youtu/.test(e.url ?? '')
    const link = isYt && e.id && /^[A-Za-z0-9_-]{11}$/.test(e.id) ? `https://www.youtube.com/watch?v=${e.id}` : (e.webpage_url ?? e.url ?? '')
    if (!/^https?:\/\//.test(link) || seen.has(link)) continue
    seen.add(link)
    const thumbs = (e.thumbnails ?? []).filter((t) => t.url)
    entries.push({
      url: link,
      title: title || link,
      channel: e.channel ?? e.uploader ?? j.channel ?? j.uploader ?? '',
      duration: e.duration ?? 0,
      thumbnail: isYt && e.id ? `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg` : ((thumbs.find((t) => (t.width ?? 0) >= 200) ?? thumbs.at(-1))?.url ?? '')
    })
  }
  if (!entries.length) throw new Error("This link doesn't contain any videos SongForge can open.")
  return {
    title: j.title ?? 'Playlist',
    channel: j.channel ?? j.uploader ?? '',
    entries: entries.slice(0, MAX_PLAYLIST),
    truncated: entries.length > MAX_PLAYLIST
  }
}

export async function searchYouTube(query: string, limit = 18): Promise<SearchResult[]> {
  await ensureYtdlp()
  const r = await run(ytdlpPath(), ['--js-runtimes', `node:${process.execPath}`, '--flat-playlist', '-J', '--no-warnings', `ytsearch${limit}:${query}`], {
    env: ytdlpEnv
  })
  if (r.code !== 0) throw new Error(friendlyYtError(r.stderr))
  const j = JSON.parse(r.stdout)
  type Entry = { id: string; title?: string; channel?: string; uploader?: string; duration?: number; view_count?: number; thumbnails?: Array<{ url: string; width?: number }> }
  return (j.entries ?? [])
    .filter((e: Entry) => e?.id && e.title)
    .map((e: Entry) => ({
      id: e.id,
      url: `https://www.youtube.com/watch?v=${e.id}`,
      title: e.title ?? '',
      channel: e.channel ?? e.uploader ?? '',
      duration: e.duration ?? 0,
      views: e.view_count,
      thumbnail: `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`
    }))
}
