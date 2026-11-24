import { spawn, type SpawnOptions } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import { paths } from './store'
import type { ToolStatus } from '@shared/types'

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

export interface RunOptions extends SpawnOptions {
  onLine?: (line: string, stream: 'stdout' | 'stderr') => void
  signal?: AbortSignal
}

/** Spawn a process, collect output, and stream lines to an optional callback. */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  const { onLine, ...spawnOpts } = opts
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, ...spawnOpts })
    let stdout = ''
    let stderr = ''
    const pump = (stream: 'stdout' | 'stderr') => {
      let buf = ''
      return (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        if (stream === 'stdout') stdout += text
        else stderr += text
        if (!onLine) return
        buf += text
        const lines = buf.split(/\r\n|\r|\n/)
        buf = lines.pop() ?? ''
        for (const l of lines) if (l.trim()) onLine(l, stream)
      }
    }
    child.stdout?.on('data', pump('stdout'))
    child.stderr?.on('data', pump('stderr'))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}

export function ffmpegPath(): string {
  const p = (ffmpegStatic as unknown as string) ?? 'ffmpeg'
  return p.replace('app.asar', 'app.asar.unpacked')
}

export function ytdlpPath(): string {
  return join(paths.bin, 'yt-dlp.exe')
}

/**
 * yt-dlp needs a JavaScript runtime to solve YouTube's player challenges.
 * We hand it Electron's own binary running in Node mode, so users don't need Deno/Node installed.
 */
export function ytdlpBaseArgs(): string[] {
  return [
    '--js-runtimes',
    `node:${process.execPath}`,
    '--ffmpeg-location',
    ffmpegPath(),
    '--no-playlist',
    '--no-warnings',
    '--newline'
  ]
}
export const ytdlpEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1', PYTHONIOENCODING: 'utf-8' }

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'

export async function ensureYtdlp(onProgress?: (pct: number) => void): Promise<string> {
  const p = ytdlpPath()
  if (existsSync(p)) return p
  const res = await fetch(YTDLP_URL)
  if (!res.ok || !res.body) throw new Error(`Could not download yt-dlp (${res.status})`)
  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    got += value.length
    if (total && onProgress) onProgress((got / total) * 100)
  }
  writeFileSync(p, Buffer.concat(chunks))
  return p
}

export async function updateYtdlp(): Promise<string> {
  await ensureYtdlp()
  const r = await run(ytdlpPath(), ['-U'], { env: ytdlpEnv })
  return (r.stdout + r.stderr).trim().split(/\r?\n/).pop() ?? ''
}

async function findPython(): Promise<string | null> {
  for (const cand of ['python', 'py']) {
    try {
      const r = await run(cand, ['--version'])
      if (r.code === 0) return cand
    } catch {
      /* not found */
    }
  }
  return null
}

export async function demucsStatus(): Promise<ToolStatus['demucs']> {
  const py = await findPython()
  if (!py) return { ok: false, error: 'Python not found' }
  try {
    const r = await run(py, ['-c', 'import demucs, soundfile; print("ok")'])
    return r.stdout.includes('ok') ? { ok: true, python: py } : { ok: false, python: py, error: 'Demucs not installed' }
  } catch (e) {
    return { ok: false, python: py, error: String(e) }
  }
}

export async function installDemucs(onLine: (l: string) => void): Promise<boolean> {
  const py = await findPython()
  if (!py) throw new Error('Python 3 is required for vocal isolation. Install it from python.org first.')
  const r = await run(py, ['-m', 'pip', 'install', '-U', 'demucs', 'soundfile'], {
    onLine: (l) => onLine(l)
  })
  return r.code === 0
}

export async function toolStatus(): Promise<ToolStatus> {
  const status: ToolStatus = {
    ytdlp: { ok: false },
    ffmpeg: { ok: existsSync(ffmpegPath()), path: ffmpegPath() },
    demucs: { ok: false }
  }
  if (existsSync(ytdlpPath())) {
    try {
      const r = await run(ytdlpPath(), ['--version'], { env: ytdlpEnv })
      status.ytdlp = { ok: r.code === 0, version: r.stdout.trim(), path: ytdlpPath() }
    } catch {
      status.ytdlp = { ok: false, path: ytdlpPath() }
    }
  }
  status.demucs = await demucsStatus()
  return status
}
