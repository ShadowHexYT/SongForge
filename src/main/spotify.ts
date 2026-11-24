import { app, shell } from 'electron'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SpotifyStatus } from '@shared/types'
import { getLibrary, getSettings } from './store'

function spotifyRoots(): string[] {
  const roaming = app.getPath('appData')
  const local = process.env.LOCALAPPDATA ?? join(app.getPath('home'), 'AppData', 'Local')
  const roots = [join(roaming, 'Spotify')]
  const pkgs = join(local, 'Packages')
  if (existsSync(pkgs)) {
    for (const d of readdirSync(pkgs)) if (d.startsWith('SpotifyAB.SpotifyMusic')) roots.push(join(pkgs, d, 'LocalState', 'Spotify'))
  }
  return roots.filter(existsSync)
}

function prefsFiles(root: string): string[] {
  const files = [join(root, 'prefs')]
  const users = join(root, 'Users')
  if (existsSync(users)) for (const u of readdirSync(users)) files.push(join(users, u, 'prefs'))
  return files.filter(existsSync)
}

const norm = (s: string) => s.toLowerCase().replace(/\\\\/g, '/').replace(/\\/g, '/').replace(/%5c/gi, '/').replace(/%3a/gi, ':')

/** Best-effort: Spotify stores added Local Files sources in its prefs file. */
export function spotifyStatus(): SpotifyStatus {
  const outputDir = getSettings().outputDir
  const roots = spotifyRoots()
  const target = norm(outputDir)
  let folderRegistered = false
  for (const r of roots) {
    for (const f of prefsFiles(r)) {
      try {
        if (norm(readFileSync(f, 'utf8')).includes(target)) folderRegistered = true
      } catch {
        /* ignore */
      }
    }
  }
  return { installed: roots.length > 0, folderRegistered, outputDir, songCount: getLibrary().songs.length }
}

export async function openSpotify(): Promise<void> {
  await shell.openExternal('spotify:collection:local-files').catch(() => shell.openExternal('https://open.spotify.com'))
}
