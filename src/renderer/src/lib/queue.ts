import { create } from 'zustand'
import type { PreparedSource } from '@shared/types'
import { extractLinks, isPlaylistUrl } from '@shared/sites'
import { api, newJobId } from './api'
import { useApp } from './store'

export type PreparedWithHint = PreparedSource & { startHint?: number | null }

export interface QueueItem {
  id: string
  url: string
  title?: string
  thumbnail?: string
  status: 'waiting' | 'loading' | 'ready' | 'error' | 'opened'
  stage: string
  progress: number
  source?: PreparedWithHint
  error?: string
  /** Open in the editor as soon as it's ready (single-link paste / search pick) */
  autoOpen?: boolean
}

interface QueueState {
  items: QueueItem[]
  add: (entries: Array<{ url: string; title?: string; thumbnail?: string }>, autoOpen?: boolean) => void
  remove: (id: string) => void
  clearDone: () => void
  open: (id: string) => Promise<void>
  nextReady: () => QueueItem | undefined
}

/** Links in pasted text: YouTube, TikTok, Instagram, SoundCloud and any other http(s) link. */
export const extractUrls = (text: string) => extractLinks(text, true)

/**
 * Queue pasted links. Playlists and channels open a picker so you can choose which videos to get;
 * a single video opens in the studio when it's ready.
 */
export function queueLinks(urls: string[]): { videos: number; lists: number } {
  const lists = urls.filter(isPlaylistUrl)
  const videos = urls.filter((u) => !isPlaylistUrl(u))
  if (videos.length) useQueue.getState().add(videos.map((url) => ({ url })), videos.length === 1 && !lists.length)
  if (lists.length) useApp.getState().openSheet({ kind: 'playlist', urls: lists })
  return { videos: videos.length, lists: lists.length }
}

/** Queue a file from this PC (audio or video) as a source. */
export function addFile(path: string) {
  const name = path.replaceAll('\\', '/').split('/').pop() ?? path
  useQueue.getState().add([{ url: api.fileUrl(path), title: name }], true)
}

export const cleanError = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** Open a prepared source in the editor, restoring an auto-saved session if there is one. */
export async function openSource(source: PreparedWithHint) {
  const session = await api.session.get(source.id)
  useApp.getState().navigate({ name: 'editor', source, session: session ?? undefined })
}

let running = false
const jobToItem = new Map<string, string>()

api.onProgress((e) => {
  const id = jobToItem.get(e.jobId)
  if (!id) return
  useQueue.setState((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, stage: e.stage, progress: e.percent } : i)) }))
})

async function pump() {
  if (running) return
  running = true
  try {
    for (;;) {
      const item = useQueue.getState().items.find((i) => i.status === 'waiting')
      if (!item) break
      const patch = (p: Partial<QueueItem>) => useQueue.setState((s) => ({ items: s.items.map((i) => (i.id === item.id ? { ...i, ...p } : i)) }))
      const jobId = newJobId()
      jobToItem.set(jobId, item.id)
      patch({ status: 'loading', stage: 'Starting', progress: 1 })
      try {
        const source = await api.source.prepare(jobId, item.url)
        patch({ status: 'ready', source, title: source.title, progress: 100, stage: 'Ready' })
        const st = useApp.getState()
        if (item.autoOpen && (st.route.name === 'forge' || st.route.name === 'library')) await useQueue.getState().open(item.id)
        else if (!item.url.startsWith('file:') && !useQueue.getState().items.some((i) => i.status === 'waiting')) {
          const ready = useQueue.getState().items.filter((i) => i.status === 'ready').length
          api.notify(ready > 1 ? `${ready} videos ready to clip` : 'Ready to clip', ready > 1 ? 'Open them from the Forge page.' : source.title)
        }
      } catch (e) {
        patch({ status: 'error', error: cleanError(e) })
        api.notify("Couldn't download a video", cleanError(e))
      } finally {
        jobToItem.delete(jobId)
      }
    }
  } finally {
    running = false
  }
}

export const useQueue = create<QueueState>((set, get) => ({
  items: [],
  add: (entries, autoOpen = false) => {
    const existing = new Set(get().items.filter((i) => i.status === 'waiting' || i.status === 'loading' || i.status === 'ready').map((i) => i.url))
    const kept = get().items.filter((i) => !(i.status === 'opened' && entries.some((e) => e.url === i.url)))
    const fresh = entries
      .filter((e) => !existing.has(e.url))
      .map((e) => ({ id: newJobId(), url: e.url, title: e.title, thumbnail: e.thumbnail, status: 'waiting' as const, stage: 'Waiting', progress: 0, autoOpen }))
    set({ items: [...kept, ...fresh] })
    pump()
  },
  remove: (id) => set({ items: get().items.filter((i) => i.id !== id) }),
  clearDone: () => set({ items: get().items.filter((i) => i.status === 'waiting' || i.status === 'loading' || i.status === 'ready') }),
  open: async (id) => {
    const item = get().items.find((i) => i.id === id)
    if (!item?.source) return
    set({ items: get().items.map((i) => (i.id === id ? { ...i, status: 'opened' } : i)) })
    await openSource(item.source)
  },
  nextReady: () => get().items.find((i) => i.status === 'ready')
}))
