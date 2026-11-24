import { create } from 'zustand'
import type { Song } from '@shared/types'
import { mediaUrl } from './api'

type Repeat = 'off' | 'all' | 'one'

interface PlayerState {
  queue: Song[]
  order: number[] // indices into queue, shuffled or not
  pos: number // position within order
  playing: boolean
  time: number
  duration: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: Repeat
  expanded: boolean
  current: () => Song | null
  playSongs: (songs: Song[], startIndex?: number) => void
  enqueue: (song: Song) => void
  toggle: () => void
  pause: () => void
  next: () => void
  jumpTo: (pos: number) => void
  prev: () => void
  seek: (t: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  setExpanded: (v: boolean) => void
  syncSong: (s: Song) => void
  /** Swap to another version of the current song at the same point in the song (A/B compare) */
  switchVersion: (s: Song) => void
  removeSong: (id: string) => void
}

const audio = new Audio()
audio.preload = 'auto'

function loadVolume(): number {
  try {
    const v = Number(localStorage.getItem('sf-volume'))
    return isFinite(v) && v > 0 ? v : 0.8
  } catch {
    return 0.8
  }
}

function shuffled(n: number, first: number): number[] {
  const rest = [...Array(n).keys()].filter((i) => i !== first)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [first, ...rest]
}

export const usePlayer = create<PlayerState>((set, get) => {
  const loadCurrent = (autoplay = true) => {
    const s = get().current()
    if (!s) return
    audio.src = mediaUrl(s.filePath, s.updatedAt)
    if (autoplay) audio.play().catch(() => set({ playing: false }))
    updateMediaSession(s)
  }

  audio.volume = loadVolume()
  audio.addEventListener('timeupdate', () => set({ time: audio.currentTime }))
  audio.addEventListener('durationchange', () => set({ duration: audio.duration || 0 }))
  audio.addEventListener('play', () => set({ playing: true }))
  audio.addEventListener('pause', () => set({ playing: false }))
  audio.addEventListener('ended', () => {
    const { repeat } = get()
    if (repeat === 'one') {
      audio.currentTime = 0
      audio.play()
    } else get().next()
  })

  return {
    queue: [],
    order: [],
    pos: 0,
    playing: false,
    time: 0,
    duration: 0,
    volume: audio.volume,
    muted: false,
    shuffle: false,
    repeat: 'off',
    expanded: false,
    current: () => {
      const { queue, order, pos } = get()
      return queue[order[pos]] ?? null
    },
    playSongs: (songs, startIndex = 0) => {
      if (!songs.length) return
      const order = get().shuffle ? shuffled(songs.length, startIndex) : songs.map((_, i) => i)
      set({ queue: songs, order, pos: get().shuffle ? 0 : startIndex })
      loadCurrent()
    },
    enqueue: (song) => {
      const { queue, order } = get()
      if (!queue.length) return get().playSongs([song])
      set({ queue: [...queue, song], order: [...order, queue.length] })
    },
    toggle: () => {
      if (!audio.src) {
        const s = get().current()
        if (s) loadCurrent()
        return
      }
      if (audio.paused) audio.play()
      else audio.pause()
    },
    pause: () => audio.pause(),
    next: () => {
      const { pos, order, repeat } = get()
      if (pos + 1 < order.length) set({ pos: pos + 1 })
      else if (repeat === 'all') set({ pos: 0 })
      else {
        audio.pause()
        audio.currentTime = 0
        return
      }
      loadCurrent()
    },
    jumpTo: (pos) => {
      set({ pos })
      loadCurrent()
    },
    prev: () => {
      if (audio.currentTime > 3) {
        audio.currentTime = 0
        return
      }
      const { pos, order } = get()
      set({ pos: pos > 0 ? pos - 1 : order.length - 1 })
      loadCurrent()
    },
    seek: (t) => {
      audio.currentTime = t
      set({ time: t })
    },
    setVolume: (v) => {
      audio.volume = v
      audio.muted = false
      try {
        localStorage.setItem('sf-volume', String(v))
      } catch {
        /* ignore */
      }
      set({ volume: v, muted: false })
    },
    toggleMute: () => {
      audio.muted = !audio.muted
      set({ muted: audio.muted })
    },
    toggleShuffle: () => {
      const { shuffle, queue, order, pos } = get()
      const cur = order[pos] ?? 0
      if (!shuffle) set({ shuffle: true, order: shuffled(queue.length, cur), pos: 0 })
      else set({ shuffle: false, order: queue.map((_, i) => i), pos: cur })
    },
    cycleRepeat: () => set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),
    setExpanded: (expanded) => set({ expanded }),
    syncSong: (song) => {
      const { queue } = get()
      const i = queue.findIndex((s) => s.id === song.id)
      if (i < 0) return
      const isCurrent = get().current()?.id === song.id
      set({ queue: queue.map((s) => (s.id === song.id ? song : s)) })
      if (isCurrent) {
        const t = audio.currentTime
        const wasPlaying = !audio.paused
        audio.src = mediaUrl(song.filePath, song.updatedAt)
        audio.currentTime = Math.min(t, song.duration)
        if (wasPlaying) audio.play()
        updateMediaSession(song)
      }
    },
    switchVersion: (song) => {
      const cur = get().current()
      const ratio = cur && audio.duration ? audio.currentTime / audio.duration : 0
      const wasPlaying = !audio.paused || !cur
      const { queue, order, pos } = get()
      if (cur) {
        // Replace the current song in the queue so next/prev keep working
        const idx = order[pos]
        set({ queue: queue.map((s, i) => (i === idx ? song : s)) })
      } else set({ queue: [song], order: [0], pos: 0 })
      audio.src = mediaUrl(song.filePath, song.updatedAt)
      const seekTo = () => {
        audio.currentTime = Math.max(0, Math.min(song.duration - 0.5, ratio * (audio.duration || song.duration)))
        audio.removeEventListener('loadedmetadata', seekTo)
      }
      audio.addEventListener('loadedmetadata', seekTo)
      if (wasPlaying) audio.play().catch(() => set({ playing: false }))
      updateMediaSession(song)
    },
    removeSong: (id) => {
      const cur = get().current()
      if (cur?.id === id) {
        audio.pause()
        audio.removeAttribute('src')
        set({ queue: [], order: [], pos: 0, time: 0, duration: 0 })
        return
      }
      const queue = get().queue.filter((s) => s.id !== id)
      const curIdx = cur ? queue.findIndex((s) => s.id === cur.id) : 0
      set({ queue, order: queue.map((_, i) => i), pos: Math.max(0, curIdx), shuffle: false })
    }
  }
})

function updateMediaSession(s: Song) {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: s.title,
    artist: s.artist,
    album: s.album,
    artwork: s.coverPath ? [{ src: mediaUrl(s.coverPath, s.updatedAt), sizes: '1000x1000', type: 'image/jpeg' }] : []
  })
}

if ('mediaSession' in navigator) {
  const p = () => usePlayer.getState()
  navigator.mediaSession.setActionHandler('play', () => p().toggle())
  navigator.mediaSession.setActionHandler('pause', () => p().pause())
  navigator.mediaSession.setActionHandler('nexttrack', () => p().next())
  navigator.mediaSession.setActionHandler('previoustrack', () => p().prev())
  navigator.mediaSession.setActionHandler('seekto', (d) => d.seekTime != null && p().seek(d.seekTime))
}
