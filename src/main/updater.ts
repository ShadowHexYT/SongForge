import { app, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateState } from '@shared/types'

/**
 * Updates come from the GitHub releases of ShadowHexYT/SongForge. Nothing downloads until you
 * click "Download"; the new version installs when you restart (or the next time you quit).
 */
const { autoUpdater } = electronUpdater

let state: UpdateState = { status: 'idle', current: app.getVersion() }
let getWin: () => BrowserWindow | null = () => null

function set(next: Partial<UpdateState>) {
  state = { ...state, ...next, current: app.getVersion() }
  getWin()?.webContents.send('update:state', state)
}

function friendly(e: unknown): string {
  const msg = String((e as Error)?.message ?? e)
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR/i.test(msg)) return "Couldn't reach GitHub. Check your internet connection."
  if (/404|No published versions|Cannot find latest/i.test(msg)) return 'No update information was found on GitHub.'
  return msg.split('\n')[0].slice(0, 200)
}

export function initUpdater(win: () => BrowserWindow | null) {
  getWin = win
  if (!app.isPackaged) {
    state = { status: 'dev', current: app.getVersion() }
    return
  }
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: undefined }))
  autoUpdater.on('update-available', (i) => set({ status: 'available', version: i.version }))
  autoUpdater.on('update-not-available', () => set({ status: 'none' }))
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: p.percent }))
  autoUpdater.on('update-downloaded', (i) => set({ status: 'ready', version: i.version, percent: 100 }))
  autoUpdater.on('error', (e) => set({ status: 'error', error: friendly(e) }))
}

export const updateState = () => state

export async function checkForUpdates(): Promise<UpdateState> {
  if (!app.isPackaged) return state
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    set({ status: 'error', error: friendly(e) })
  }
  return state
}

export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged) return
  set({ status: 'downloading', percent: 0 })
  try {
    await autoUpdater.downloadUpdate()
  } catch (e) {
    set({ status: 'error', error: friendly(e) })
  }
}

export function installUpdate() {
  if (state.status === 'ready') autoUpdater.quitAndInstall(false, true)
}
