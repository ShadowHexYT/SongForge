import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { LibraryData, Settings } from '@shared/types'

export const paths = {
  get userData() {
    return app.getPath('userData')
  },
  get cache() {
    return ensureDir(join(app.getPath('userData'), 'sources'))
  },
  get bin() {
    return ensureDir(join(app.getPath('userData'), 'bin'))
  },
  get covers() {
    return ensureDir(join(app.getPath('userData'), 'covers'))
  },
  get sessions() {
    return ensureDir(join(app.getPath('userData'), 'sessions'))
  },
  get tmp() {
    return ensureDir(join(app.getPath('userData'), 'tmp'))
  }
}

export function ensureDir(p: string): string {
  if (!existsSync(p)) mkdirSync(p, { recursive: true })
  return p
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(readFileSync(file, 'utf8')) }
  } catch {
    return fallback
  }
}

function writeJsonAtomic(file: string, data: unknown): void {
  const tmp = file + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, file)
}

const settingsFile = () => join(paths.userData, 'settings.json')
const libraryFile = () => join(paths.userData, 'library.json')

export function defaultSettings(): Settings {
  return {
    appearance: 'dark',
    darkTheme: 'midnight',
    lightTheme: 'daylight',
    accent: 'ember',
    customAccent: '#ff6a3d',
    outputDir: join(app.getPath('music'), 'SongForge'),
    bitrate: 320,
    defaultNormalize: true,
    defaultFadeIn: 0.3,
    defaultFadeOut: 1.5,
    downloadVideoPreview: true,
    onboarded: false,
    fxPresets: [],
    clipboardWatch: true,
    notifications: true,
    toursSeen: []
  }
}

let settingsCache: Settings | null = null
export function getSettings(): Settings {
  if (!settingsCache) settingsCache = readJson(settingsFile(), defaultSettings())
  return settingsCache
}
export function saveSettings(patch: Partial<Settings>): Settings {
  settingsCache = { ...getSettings(), ...patch }
  writeJsonAtomic(settingsFile(), settingsCache)
  return settingsCache
}

let libraryCache: LibraryData | null = null
export function getLibrary(): LibraryData {
  if (!libraryCache) libraryCache = readJson<LibraryData>(libraryFile(), { songs: [], playlists: [] })
  return libraryCache
}
export function saveLibrary(next: LibraryData): LibraryData {
  libraryCache = next
  writeJsonAtomic(libraryFile(), next)
  return next
}
export function mutateLibrary(fn: (lib: LibraryData) => void): LibraryData {
  const lib = structuredClone(getLibrary())
  fn(lib)
  return saveLibrary(lib)
}
