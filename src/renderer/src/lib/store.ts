import { create } from 'zustand'
import type { LibraryData, PreparedSource, Session, Settings, Song } from '@shared/types'
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
  setImportOpen: (v: boolean) => void
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
  setImportOpen: (importOpen) => set({ importOpen }),
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
