import { app, BrowserWindow, dialog, ipcMain, Notification, protocol, shell, clipboard } from 'electron'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import type { ExportRequest, MedleyRequest, Session, Settings, Song, SongMeta } from '@shared/types'
import { MAX_CUSTOM_PRESETS } from '@shared/types'
import { getLibrary, getSettings, mutateLibrary, saveSettings, ensureDir, paths } from './store'
import { listCachedSources, prepareSource, extractStartTime, searchYouTube, expandPlaylist, AUDIO_EXT, LOCAL_EXT } from './youtube'
import { lookupTags, fetchArtwork } from './lookup'
import { exportPack } from './packs'
import { makeMedley } from './medley'
import { initUpdater, checkForUpdates, downloadUpdate, installUpdate, updateState } from './updater'
import { importSongs } from './importer'
import { searchLyrics } from './lyrics'
import { deleteSession, getSession, listSessions, saveSession } from './sessions'
import { deleteSong, exportM3U, exportSong, mergeSongs, patchSong, retagSong, sanitizeFilename } from './audio'
import { installDemucs, toolStatus, updateYtdlp, ensureYtdlp } from './tools'
import { openSpotify, spotifyStatus } from './spotify'
import { rmSync } from 'node:fs'

const here = fileURLToPath(new URL('.', import.meta.url))

// Separate profile for testing (keeps a developer's own library untouched)
if (process.env.SONGFORGE_PROFILE) app.setPath('userData', process.env.SONGFORGE_PROFILE)

protocol.registerSchemesAsPrivileged([
  { scheme: 'sf-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } }
])

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.webm': 'video/webm',
  '.opus': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

/** Serve local media with HTTP Range support so <audio>/<video> can seek. */
function registerMediaProtocol() {
  protocol.handle('sf-media', (req) => {
    const url = new URL(req.url)
    const filePath = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (!existsSync(filePath)) return new Response('Not found', { status: 404 })
    const size = statSync(filePath).size
    const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    const range = req.headers.get('range')
    if (range) {
      const m = range.match(/bytes=(\d*)-(\d*)/)
      const start = m?.[1] ? Number(m[1]) : 0
      const end = m?.[2] ? Math.min(Number(m[2]), size - 1) : size - 1
      const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream
      return new Response(stream, {
        status: 206,
        headers: {
          'Content-Type': type,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream
    return new Response(stream, {
      headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' }
    })
  })
}

let win: BrowserWindow | null = null

/** Song packs opened from Explorer (double-click a .songforge file) */
const packArgs = (argv: string[]) => argv.filter((a) => a.toLowerCase().endsWith('.songforge') && existsSync(a))
let pendingFiles = packArgs(process.argv)

// One SongForge at a time: opening a pack while it's running hands the pack to the open window
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', (_e, argv) => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  const files = packArgs(argv)
  if (files.length) win.webContents.send('open-files', files)
})

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 940,
    minHeight: 640,
    backgroundColor: '#0b0b0e',
    title: 'SongForge',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#a1a1aa', height: 40 },
    icon: join(here, '../../build/icon.png'),
    show: false,
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
      sandbox: false
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(here, '../renderer/index.html'))
}

const progress = (jobId: string) => (stage: string, percent: number, detail?: string) =>
  win?.webContents.send('progress', { jobId, stage, percent, detail })

function registerIpc() {
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    if (patch.outputDir) ensureDir(patch.outputDir)
    if (patch.fxPresets) patch.fxPresets = patch.fxPresets.slice(0, MAX_CUSTOM_PRESETS)
    return saveSettings(patch)
  })
  ipcMain.handle('notify', (_e, title: string, body: string) => {
    // Only when SongForge isn't the window you're looking at
    if (!getSettings().notifications || !Notification.isSupported() || win?.isFocused()) return
    const n = new Notification({ title, body, icon: join(here, '../../build/icon.png'), silent: false })
    n.on('click', () => {
      if (win?.isMinimized()) win.restore()
      win?.show()
      win?.focus()
    })
    n.show()
  })
  ipcMain.handle('library:get', () => getLibrary())

  ipcMain.handle('source:prepare', (_e, jobId: string, url: string) =>
    prepareSource(url, getSettings().downloadVideoPreview, progress(jobId)).then((s) => ({ ...s, startHint: extractStartTime(url) }))
  )
  ipcMain.handle('source:recent', () => listCachedSources())
  ipcMain.handle('youtube:search', (_e, q: string) => searchYouTube(q))
  ipcMain.handle('source:playlist', (_e, url: string) => expandPlaylist(url))
  ipcMain.handle('tags:lookup', (_e, title: string, artist: string, duration?: number) => lookupTags(title, artist, duration))
  ipcMain.handle('tags:artwork', (_e, url: string) => fetchArtwork(url))
  ipcMain.handle('app:pendingFiles', () => {
    const f = pendingFiles
    pendingFiles = []
    return f
  })
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('update:state', () => updateState())
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:download', () => downloadUpdate())
  ipcMain.handle('update:install', () => installUpdate())
  ipcMain.handle('lyrics:search', (_e, title: string, artist: string, duration?: number) => searchLyrics(title, artist, duration))
  ipcMain.handle('session:list', () => listSessions())
  ipcMain.handle('session:get', (_e, id: string) => getSession(id))
  ipcMain.handle('session:save', (_e, s: Session) => saveSession(s))
  ipcMain.handle('session:delete', (_e, id: string) => deleteSession(id))
  ipcMain.handle('window:theme', (_e, bg: string, symbol: string) => {
    if (!win) return
    win.setBackgroundColor(bg)
    try {
      win.setTitleBarOverlay({ color: '#00000000', symbolColor: symbol, height: 40 })
    } catch {
      /* overlay unsupported */
    }
  })

  ipcMain.handle('source:clearCache', () => {
    rmSync(paths.cache, { recursive: true, force: true })
    rmSync(paths.sessions, { recursive: true, force: true })
    return true
  })

  ipcMain.handle('song:export', (_e, req: ExportRequest) => exportSong(req, progress(req.jobId)))
  ipcMain.handle('song:retag', (_e, id: string, meta: SongMeta, cover: string | null) => retagSong(id, meta, cover))
  ipcMain.handle('song:delete', (_e, id: string, deleteFile: boolean) => {
    deleteSong(id, deleteFile)
    return getLibrary()
  })
  ipcMain.handle('song:reveal', (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.handle('song:patch', (_e, id: string, patch: Pick<Partial<Song>, 'versionGroup' | 'lyricsOffset'>) => patchSong(id, patch))
  ipcMain.handle('song:import', (_e, jobId: string, inputs: string[]) => importSongs(inputs, progress(jobId)))
  ipcMain.handle('song:merge', (_e, keepId: string, removeIds: string[]) => {
    mergeSongs(keepId, removeIds)
    return getLibrary()
  })
  ipcMain.handle('song:medley', (_e, req: MedleyRequest) => makeMedley(req, progress(req.jobId)))
  ipcMain.handle('pack:export', async (_e, jobId: string, songIds: string[], name: string, testDest?: string) => {
    // Automated tests (test profile only) skip the save dialog
    if (testDest && process.env.SONGFORGE_PROFILE) return { ...(await exportPack(songIds, name, testDest, progress(jobId))), path: testDest }
    const r = await dialog.showSaveDialog(win!, {
      title: 'Save song pack',
      defaultPath: join(app.getPath('desktop'), `${sanitizeFilename(name || 'Song pack')}.songforge`),
      filters: [{ name: 'SongForge song pack', extensions: ['songforge'] }]
    })
    if (r.canceled || !r.filePath) return null
    const res = await exportPack(songIds, name, r.filePath, progress(jobId))
    return { ...res, path: r.filePath }
  })

  ipcMain.handle('playlist:create', (_e, name: string, songIds: string[] = []) => {
    const id = randomUUID()
    mutateLibrary((lib) => lib.playlists.push({ id, name, songIds, createdAt: Date.now() }))
    return id
  })
  ipcMain.handle('playlist:update', (_e, id: string, patch: { name?: string; songIds?: string[] }) =>
    mutateLibrary((lib) => {
      const p = lib.playlists.find((x) => x.id === id)
      if (p) Object.assign(p, patch)
    })
  )
  ipcMain.handle('playlist:delete', (_e, id: string) =>
    mutateLibrary((lib) => {
      lib.playlists = lib.playlists.filter((p) => p.id !== id)
    })
  )
  ipcMain.handle('playlist:exportM3U', async (_e, id: string) => {
    const pl = getLibrary().playlists.find((p) => p.id === id)
    const r = await dialog.showSaveDialog(win!, {
      defaultPath: join(getSettings().outputDir, `${pl?.name ?? 'playlist'}.m3u8`),
      filters: [{ name: 'Playlist', extensions: ['m3u8', 'm3u'] }]
    })
    if (r.canceled || !r.filePath) return false
    exportM3U(id, r.filePath)
    return true
  })

  ipcMain.handle('tools:status', () => toolStatus())
  ipcMain.handle('tools:ensureYtdlp', () => ensureYtdlp())
  ipcMain.handle('tools:updateYtdlp', () => updateYtdlp())
  ipcMain.handle('tools:installDemucs', (_e, jobId: string) => installDemucs((l) => progress(jobId)('Installing Demucs', -1, l)))

  ipcMain.handle('spotify:status', () => spotifyStatus())
  ipcMain.handle('spotify:open', () => openSpotify())

  ipcMain.handle('dialog:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('dialog:pickSongs', async (_e, folder: boolean) => {
    const r = await dialog.showOpenDialog(win!, {
      title: folder ? 'Choose a folder of songs' : 'Choose songs to import',
      properties: folder ? ['openDirectory'] : ['openFile', 'multiSelections'],
      filters: folder
        ? undefined
        : [
            { name: 'Songs and song packs', extensions: [...AUDIO_EXT.map((e) => e.slice(1)), 'songforge'] },
            { name: 'SongForge song pack', extensions: ['songforge'] }
          ]
    })
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.handle('dialog:pickMedia', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Open an audio or video file',
      properties: ['openFile'],
      filters: [{ name: 'Audio and video', extensions: LOCAL_EXT.map((e) => e.slice(1)) }]
    })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('dialog:pickImage', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('shell:openPath', (_e, p: string) => shell.openPath(p))
  ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))
  ipcMain.handle('clipboard:read', () => clipboard.readText())
  ipcMain.handle('clipboard:write', (_e, t: string) => clipboard.writeText(t))
}

app.whenReady().then(() => {
  app.setAppUserModelId('app.songforge.desktop')
  registerMediaProtocol()
  registerIpc()
  ensureDir(getSettings().outputDir)
  createWindow()
  ensureYtdlp().catch(() => {}) // warm up in background
  initUpdater(() => win)
  if (getSettings().autoUpdate) setTimeout(() => checkForUpdates(), 6000)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
