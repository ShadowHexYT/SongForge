import { create } from 'zustand'
import type { LibraryData, PreparedSource, Session, Settings, Song, UpdateState } from '@shared/types'
import { api } from './api'

export type Route =
  | { name: 'forge' }
  | { name: 'editor'; source: PreparedSource & { startHint?: number | null }; editSong?: Song; session?: Session }
  | { name: 'library' }
  | { name: 'playlist'; id: string }
  | { name: 'spotify' }
  | { name: 'settings' }
  | { name: 'help' }

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  title: string
  body?: string
}

/** Full-screen helpers opened from anywhere */
export type Sheet =
  | { kind: 'pack'; songIds: string[]; name: string }
  | { kind: 'medley'; songIds: string[] }
  | { kind: 'dupes' }
  | { kind: 'playlist'; urls: string[] }

interface AppState {
  route: Route
  library: LibraryData
  settings: Settings | null
  toasts: Toast[]
  editingSong: Song | null
  /** The "Import songs" dialog */
  importOpen: boolean
  /** Song whose versions are shown in the Versions dialog */
  versionsOf: Song | null
  /** Files to import as soon as the dialog opens (song packs opened from Explorer) */
  importFiles: string[] | null
  setImportOpen: (v: boolean, files?: string[]) => void
  sheet: Sheet | null
  openSheet: (s: Sheet | null) => void
  update: UpdateState | null
  setUpdate: (u: UpdateState) => void
  showVersions: (s: Song | null) => void
  /** The guided tour that's running, if any */
  tour: string | null
  startTour: (id: string) => void
  endTour: () => void
  navigate: (r: Route) => void
  refresh: () => Promise<void>
  setLibrary: (l: LibraryData) => void
  setSettings: (s: Settings) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
  editSong: (s: Song | null) => void
}

let toastId = 0

export const useApp = create<AppState>((set) => ({
  route: { name: 'forge' },
  library: { songs: [], playlists: [] },
  settings: null,
  toasts: [],
  editingSong: null,
  importOpen: false,
  versionsOf: null,
  importFiles: null,
  setImportOpen: (importOpen, files) => set({ importOpen, importFiles: files ?? null }),
  sheet: null,
  openSheet: (sheet) => set({ sheet }),
  update: null,
  setUpdate: (update) => set({ update }),
  showVersions: (versionsOf) => set({ versionsOf }),
  tour: null,
  startTour: (tour) => set({ tour }),
  endTour: () => set({ tour: null }),
  navigate: (route) => set({ route }),
  refresh: async () => {
    const [library, settings] = await Promise.all([api.library.get(), api.settings.get()])
    set({ library, settings })
  },
  setLibrary: (library) => set({ library }),
  setSettings: (settings) => set({ settings }),
  toast: (t) => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.kind === 'error' ? 7000 : 4000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  editSong: (editingSong) => set({ editingSong })
}))
