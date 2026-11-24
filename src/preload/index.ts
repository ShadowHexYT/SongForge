import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  ExportRequest,
  ImportResult,
  LyricsResult,
  SearchResult,
  Session,
  LibraryData,
  PreparedSource,
  ProgressEvent,
  Settings,
  Song,
  SongMeta,
  SpotifyStatus,
  ToolStatus
} from '../shared/types'

const invoke = <T>(ch: string, ...args: unknown[]) => ipcRenderer.invoke(ch, ...args) as Promise<T>

const api = {
  settings: {
    get: () => invoke<Settings>('settings:get'),
    set: (patch: Partial<Settings>) => invoke<Settings>('settings:set', patch)
  },
  library: {
    get: () => invoke<LibraryData>('library:get')
  },
  source: {
    prepare: (jobId: string, url: string) => invoke<PreparedSource & { startHint: number | null }>('source:prepare', jobId, url),
    recent: () =>
      invoke<Array<Pick<PreparedSource, 'id' | 'title' | 'channel' | 'url' | 'duration' | 'thumbnailPath'>>>('source:recent'),
    clearCache: () => invoke<boolean>('source:clearCache')
  },
  youtube: {
    search: (q: string) => invoke<SearchResult[]>('youtube:search', q)
  },
  lyrics: {
    search: (title: string, artist: string, duration?: number) => invoke<LyricsResult[]>('lyrics:search', title, artist, duration)
  },
  notify: (title: string, body: string) => invoke<void>('notify', title, body),
  session: {
    list: () => invoke<Session[]>('session:list'),
    get: (id: string) => invoke<Session | null>('session:get', id),
    save: (s: Session) => invoke<void>('session:save', s),
    delete: (id: string) => invoke<void>('session:delete', id)
  },
  window: {
    setTheme: (bg: string, symbol: string) => invoke<void>('window:theme', bg, symbol)
  },
  song: {
    export: (req: ExportRequest) => invoke<Song>('song:export', req),
    retag: (id: string, meta: SongMeta, cover: string | null) => invoke<Song>('song:retag', id, meta, cover),
    delete: (id: string, deleteFile: boolean) => invoke<LibraryData>('song:delete', id, deleteFile),
    reveal: (path: string) => invoke<void>('song:reveal', path),
    patch: (id: string, patch: Pick<Partial<Song>, 'versionGroup' | 'lyricsOffset'>) => invoke<Song | null>('song:patch', id, patch),
    import: (jobId: string, inputs: string[]) => invoke<ImportResult>('song:import', jobId, inputs)
  },
  playlist: {
    create: (name: string, songIds?: string[]) => invoke<string>('playlist:create', name, songIds),
    update: (id: string, patch: { name?: string; songIds?: string[] }) => invoke<LibraryData>('playlist:update', id, patch),
    delete: (id: string) => invoke<LibraryData>('playlist:delete', id),
    exportM3U: (id: string) => invoke<boolean>('playlist:exportM3U', id)
  },
  tools: {
    status: () => invoke<ToolStatus>('tools:status'),
    ensureYtdlp: () => invoke<string>('tools:ensureYtdlp'),
    updateYtdlp: () => invoke<string>('tools:updateYtdlp'),
    installDemucs: (jobId: string) => invoke<boolean>('tools:installDemucs', jobId)
  },
  spotify: {
    status: () => invoke<SpotifyStatus>('spotify:status'),
    open: () => invoke<void>('spotify:open')
  },
  dialog: {
    pickFolder: () => invoke<string | null>('dialog:pickFolder'),
    pickImage: () => invoke<string | null>('dialog:pickImage'),
    pickSongs: (folder: boolean) => invoke<string[]>('dialog:pickSongs', folder),
    pickMedia: () => invoke<string | null>('dialog:pickMedia')
  },
  shell: {
    openPath: (p: string) => invoke<string>('shell:openPath', p),
    openExternal: (u: string) => invoke<void>('shell:openExternal', u)
  },
  clipboard: {
    read: () => invoke<string>('clipboard:read'),
    write: (t: string) => invoke<void>('clipboard:write', t)
  },
  filePathFor: (f: File) => webUtils.getPathForFile(f),
  /** file:// URL for a local path, used to open files from this PC as sources */
  fileUrl: (p: string) => 'file:///' + p.split('\\').join('/').split('/').map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg))).join('/'),
  onProgress: (cb: (e: ProgressEvent) => void) => {
    const h = (_: unknown, e: ProgressEvent) => cb(e)
    ipcRenderer.on('progress', h)
    return () => {
      ipcRenderer.removeListener('progress', h)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
