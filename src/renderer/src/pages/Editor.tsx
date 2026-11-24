import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  Keyboard,
  ListPlus,
  Loader2,
  Pause,
  Play,
  Plus,
  Redo2,
  Repeat,
  Scissors,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  Undo2,
  ZoomIn,
  Magnet,
  CloudCheck,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Wand2,
  Piano,
  X,
  CircleHelp
} from 'lucide-react'
import type { ClipSettings, Marker, PreparedSource, Session, Song, SongMeta } from '@shared/types'
import { guessFromTitle } from '@shared/parseTitle'
import { siteName } from '@shared/sites'
import { api, mediaUrl, newJobId } from '@/lib/api'
import { useApp } from '@/lib/store'
import { usePlayer } from '@/lib/player'
import { useQueue, cleanError } from '@/lib/queue'
import { useHistory } from '@/lib/history'
import { LiveAudio } from '@/lib/liveAudio'
import { CLIP_COLORS, fmtTime } from '@/lib/format'
import { cssVar } from '@/lib/theme'
import { Waveform, type WaveClip } from '@/components/Waveform'
import { emptyCover, renderCover, type CoverState } from '@/components/CoverCropper'
import { Button, IconButton, Kbd, Modal, ProgressBar, Range, cx } from '@/components/ui'
import { Inspector, type InspectorTab } from '@/components/editor/Inspector'
import { draftHash, fxActive as hasFx, newKey, normalizeClip, snapToQuiet, type Draft, type EditorState, type Forged, type ForgeStatus } from '@/components/editor/model'
import { suggestClips, type Suggestion } from '@/components/editor/suggest'
import { SmithHammer } from '@/components/ForgeIcons'
import { useMediaQuery } from '@/lib/useMediaQuery'

/** Clip colors: the first follows the theme accent, the rest cycle a fixed palette. */
function clipColor(i: number): string {
  const accent = cssVar('--color-ember-500')
  const rest = CLIP_COLORS.slice(1)
  return i === 0 && /^#[0-9a-f]{6}$/i.test(accent) ? accent : rest[(i - 1 + rest.length) % rest.length]
}

type Source = PreparedSource & { startHint?: number | null }
type StoredDraft = Draft & { songId?: string; savedHash?: string }

function readPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v == null ? fallback : v === '1'
  } catch {
    return fallback
  }
}
function writePref(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function EditorPage({ source, editSong, session }: { source: Source; editSong?: Song; session?: Session }) {
  const navigate = useApp((s) => s.navigate)
  const toast = useApp((s) => s.toast)
  const refresh = useApp((s) => s.refresh)
  const settings = useApp((s) => s.settings)
  const syncSong = usePlayer((s) => s.syncSong)
  const nextInQueue = useQueue((s) => s.items.find((i) => i.status === 'ready'))
  const openQueued = useQueue((s) => s.open)

  // ---------- initial state ----------
  const guess = useMemo<SongMeta>(() => {
    const g = guessFromTitle(source.title, source.channel)
    return { title: source.track || g.title, artist: source.artist || g.artist, album: source.album || '', year: source.uploadDate?.slice(0, 4) ?? '', genre: '', lyrics: '' }
  }, [source])

  const thumbCover = useCallback(
    (): CoverState => (source.thumbnailPath ? { kind: 'thumb', src: mediaUrl(source.thumbnailPath), panX: 0.5, panY: 0.5, zoom: 1 } : emptyCover),
    [source.thumbnailPath]
  )

  const defaultClip = useCallback(
    (start: number, end: number): ClipSettings =>
      normalizeClip({ start, end, fadeIn: settings?.defaultFadeIn ?? 0.3, fadeOut: settings?.defaultFadeOut ?? 1.5, normalize: settings?.defaultNormalize ?? true }),
    [settings]
  )

  const [initial] = useState(() => {
    const forged: Record<string, Forged> = {}
    if (editSong) {
      const { title, artist, album, year, genre, lyrics, syncedLyrics } = editSong
      const d: Draft = {
        key: newKey(),
        color: clipColor(0),
        meta: { title, artist, album, year, genre, lyrics, syncedLyrics },
        clip: normalizeClip(editSong),
        cover: editSong.coverPath
          ? { kind: 'existing', src: mediaUrl(editSong.coverPath, editSong.updatedAt), path: editSong.coverPath, panX: 0.5, panY: 0.5, zoom: 1 }
          : thumbCover()
      }
      forged[d.key] = { songId: editSong.id, hash: draftHash(d) }
      return { state: { drafts: [d], markers: [] } as EditorState, forged }
    }
    if (session?.drafts?.length) {
      const drafts = (session.drafts as StoredDraft[]).map(({ songId, savedHash, ...d }) => {
        const draft: Draft = { ...d, clip: normalizeClip(d.clip) }
        if (songId && savedHash) forged[draft.key] = { songId, hash: savedHash }
        return draft
      })
      return { state: { drafts, markers: session.markers ?? [] }, forged }
    }
    const dur = source.duration
    const s = source.startHint ?? 0
    const [start, end] = source.startHint != null ? [s, Math.min(dur, s + 180)] : dur <= 600 ? [0, dur] : [0, Math.min(dur, 60)]
    return { state: { drafts: [{ key: newKey(), color: clipColor(0), meta: guess, clip: defaultClip(start, end), cover: thumbCover() }], markers: [] } as EditorState, forged }
  })

  const history = useHistory<EditorState>(initial.state)
  const { drafts, markers } = history.state
  const stateRef = useRef(history.state)
  stateRef.current = history.state

  const [forged, setForged] = useState<Record<string, Forged>>(initial.forged)
  const [status, setStatus] = useState<Record<string, ForgeStatus>>({})
  const [selectedKey, setSelectedKey] = useState<string | null>(drafts[0]?.key ?? null)
  const [tab, setTab] = useState<InspectorTab>('trim')
  const selected = drafts.find((d) => d.key === selectedKey) ?? null
  const selectedIndex = drafts.findIndex((d) => d.key === selectedKey)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  const isDirty = (d: Draft) => forged[d.key]?.hash !== draftHash(d)

  // ---------- media / transport ----------
  const [media, setMedia] = useState<HTMLMediaElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [loop, setLoop] = useState(() => readPref('sf-loop', true))
  const [liveFx, setLiveFx] = useState(() => readPref('sf-livefx', true))
  const [autoSnap, setAutoSnap] = useState(() => readPref('sf-autosnap', false))
  const [zoom, setZoom] = useState(0)
  const [demucsOk, setDemucsOk] = useState<boolean | null>(null)
  const [showKeys, setShowKeys] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const liveRef = useRef<LiveAudio | null>(null)
  const stopAt = useRef<number | null>(null)
  const loopRef = useRef(loop)
  loopRef.current = loop

  const mediaRef = useCallback((el: HTMLMediaElement | null) => setMedia(el), [])

  useEffect(() => {
    if (!media) return
    const live = new LiveAudio(media)
    liveRef.current = live
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (media.paused) return
      const t = media.currentTime
      if (stopAt.current != null && t >= stopAt.current) {
        media.pause()
        stopAt.current = null
        return
      }
      const sel = selectedRef.current
      if (stopAt.current == null && loopRef.current && sel && t >= sel.clip.end && t < sel.clip.end + 1.5) media.currentTime = sel.clip.start
    }
    raf = requestAnimationFrame(tick)
    const onTime = () => setTime(media.currentTime)
    const onPlay = () => {
      setPlaying(true)
      usePlayer.getState().pause()
      live.init().then(() => live.resume())
    }
    const onPause = () => setPlaying(false)
    media.addEventListener('timeupdate', onTime)
    media.addEventListener('seeked', onTime)
    media.addEventListener('play', onPlay)
    media.addEventListener('pause', onPause)
    const first = stateRef.current.drafts[0]
    if (first) media.currentTime = first.clip.start
    return () => {
      cancelAnimationFrame(raf)
      media.removeEventListener('timeupdate', onTime)
      media.removeEventListener('seeked', onTime)
      media.removeEventListener('play', onPlay)
      media.removeEventListener('pause', onPause)
      live.destroy()
    }
  }, [media])

  // Push the selected clip's effects to the live preview engine
  useEffect(() => {
    if (!selected) return
    const c = selected.clip
    liveRef.current?.update({ enabled: liveFx, pitch: c.pitch, speed: c.speed, gainDb: c.gain, start: c.start, end: c.end, fadeIn: c.fadeIn, fadeOut: c.fadeOut, fx: c.fx })
  }, [selected, liveFx, media])

  useEffect(() => {
    api.tools.status().then((s) => setDemucsOk(s.demucs.ok))
  }, [])

  const togglePlay = () => {
    if (!media) return
    stopAt.current = null
    if (media.paused) {
      const sel = selectedRef.current
      if (sel && loop && (media.currentTime < sel.clip.start || media.currentTime >= sel.clip.end)) media.currentTime = sel.clip.start
      media.play()
    } else media.pause()
  }
  const seek = (t: number) => {
    if (media) media.currentTime = Math.max(0, Math.min(source.duration, t))
  }
  const playRange = (from: number, to: number) => {
    if (!media) return
    media.currentTime = from
    stopAt.current = to
    media.play()
  }

  // ---------- state helpers ----------
  const setDrafts = (fn: (ds: Draft[]) => Draft[], group?: string) => history.set((s) => ({ ...s, drafts: fn(s.drafts) }), group)
  const setMarkers = (fn: (ms: Marker[]) => Marker[], group?: string) => history.set((s) => ({ ...s, markers: fn(s.markers) }), group)
  const updateDraft = (key: string, fn: (d: Draft) => Partial<Draft>, group?: string) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...fn(d) } : d)), group)

  const updateClip = (key: string, patch: Partial<ClipSettings>, group?: string) =>
    updateDraft(
      key,
      (d) => {
        const c = { ...d.clip, ...patch }
        if (patch.start != null) c.start = Math.max(0, Math.min(patch.start, c.end - 0.5))
        if (patch.end != null) c.end = Math.min(source.duration, Math.max(patch.end, c.start + 0.5))
        return { clip: c }
      },
      group ? `${key}:${group}` : undefined
    )

  const setEdge = (key: string, edge: 'start' | 'end', t: number) => updateClip(key, { [edge]: t })
  const snapEdge = (key: string, edge: 'start' | 'end') => {
    const d = drafts.find((x) => x.key === key)
    if (!d) return
    setEdge(key, edge, snapToQuiet(source.peaks, source.peaksPerSecond, d.clip[edge]))
  }

  const addClip = (start: number, end: number, meta?: Partial<SongMeta>) => {
    const key = newKey()
    setDrafts((ds) => [
      ...ds,
      { key, color: clipColor(ds.length), meta: { ...guess, ...meta }, clip: defaultClip(start, end), cover: ds[ds.length - 1]?.cover ?? thumbCover() }
    ])
    setSelectedKey(key)
    return key
  }
  const duplicateClip = (key: string) => {
    const d = drafts.find((x) => x.key === key)
    if (!d) return
    const nk = newKey()
    setDrafts((ds) => {
      const i = ds.findIndex((x) => x.key === key)
      const copy: Draft = { ...structuredClone(d), key: nk, color: clipColor(ds.length), meta: { ...d.meta, title: `${d.meta.title} (2)` } }
      return [...ds.slice(0, i + 1), copy, ...ds.slice(i + 1)]
    })
    setSelectedKey(nk)
  }
  /** A copy of the clip that removes the voice, so you get a karaoke/instrumental version too. */
  const instrumentalVersion = (key: string) => {
    const d = drafts.find((x) => x.key === key)
    if (!d) return
    const nk = newKey()
    setDrafts((ds) => {
      const i = ds.findIndex((x) => x.key === key)
      const title = /instrumental/i.test(d.meta.title) ? d.meta.title : `${d.meta.title || 'Untitled'} (Instrumental)`
      const copy: Draft = { ...structuredClone(d), key: nk, color: clipColor(ds.length), meta: { ...d.meta, title, lyrics: '', syncedLyrics: '' }, clip: { ...d.clip, cleanup: 'instrumental' } }
      return [...ds.slice(0, i + 1), copy, ...ds.slice(i + 1)]
    })
    setSelectedKey(nk)
    setTab('sound')
    if (!demucsOk) toast({ kind: 'info', title: 'Instrumental needs the AI add-on', body: 'Install Demucs in Settings → Tools before forging this clip.' })
  }

  const removeClip = (key: string) => {
    const i = drafts.findIndex((d) => d.key === key)
    setDrafts((ds) => ds.filter((d) => d.key !== key))
    if (selectedKey === key) setSelectedKey(drafts[i + 1]?.key ?? drafts[i - 1]?.key ?? null)
  }
  const addFromChapters = () => {
    const existing = new Set(drafts.map((d) => Math.round(d.clip.start)))
    const fresh = source.chapters.filter((ch) => !existing.has(Math.round(ch.start)))
    setDrafts((ds) => [
      ...ds,
      ...fresh.map((ch, i) => {
        const g = guessFromTitle(ch.title, guess.artist)
        return {
          key: newKey(),
          color: clipColor(ds.length + i),
          meta: { ...guess, title: g.title, artist: g.artist || guess.artist },
          clip: defaultClip(ch.start, ch.end),
          cover: ds[ds.length - 1]?.cover ?? thumbCover()
        }
      })
    ])
    toast({ kind: 'info', title: `Added ${fresh.length} clip${fresh.length === 1 ? '' : 's'} from chapters` })
  }

  // ---------- first visit: studio tour ----------
  useEffect(() => {
    const s = useApp.getState()
    if (!s.settings?.onboarded || s.settings.toursSeen?.includes('studio') || s.tour) return
    const t = setTimeout(() => {
      if (!useApp.getState().tour) useApp.getState().startTour('studio')
    }, 900)
    return () => clearTimeout(t)
  }, [])

  // ---------- suggested clips ----------
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [showSuggest, setShowSuggest] = useState(false)
  const [suggestBanner, setSuggestBanner] = useState(false)
  const pristine = useRef(initial.state.drafts.length === 1 && !editSong && !session ? draftHash(initial.state.drafts[0]) : null)
  const runSuggest = (open = true) => {
    const found = suggestClips(source.peaks, source.peaksPerSecond, source.duration, source.chapters)
    setSuggestions(found)
    if (open) setShowSuggest(true)
    return found
  }
  useEffect(() => {
    // Long videos with no saved work: look for songs right away and offer them
    if (editSong || session || source.duration < 240) return
    const found = runSuggest(false)
    if (found.length >= 2) setSuggestBanner(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const addSuggestions = (picked: Suggestion[]) => {
    if (!picked.length) return
    const only = stateRef.current.drafts
    // Replace the starter clip if you haven't touched it yet
    const replace = only.length === 1 && pristine.current != null && draftHash(only[0]) === pristine.current && !forged[only[0].key]
    const base = replace ? [] : only
    const fresh: Draft[] = picked.map((sg, i) => {
      const g = sg.title ? guessFromTitle(sg.title, guess.artist) : null
      return {
        key: newKey(),
        color: clipColor(base.length + i),
        meta: { ...guess, title: g?.title || (picked.length > 1 ? `Song ${i + 1}` : guess.title), artist: g?.artist || guess.artist },
        clip: defaultClip(sg.start, sg.end),
        cover: base[base.length - 1]?.cover ?? thumbCover()
      }
    })
    setDrafts(() => [...base, ...fresh])
    setSelectedKey(fresh[0].key)
    setTab('tags')
    setShowSuggest(false)
    setSuggestBanner(false)
    toast({ kind: 'success', title: `Added ${fresh.length} clip${fresh.length === 1 ? '' : 's'}`, body: 'Give each one a name in the Tags tab, then forge.' })
  }

  const addMarker = () => {
    const t = media?.currentTime ?? time
    const n = markers.length + 1
    setMarkers((ms) => [...ms, { id: newKey('mark'), time: t, label: `M${n}` }].sort((a, b) => a.time - b.time))
  }
  const clipFromMarker = (m: Marker) => {
    const sorted = [...markers].sort((a, b) => a.time - b.time)
    const next = sorted.find((x) => x.time > m.time + 0.5)
    addClip(m.time, next ? next.time : Math.min(source.duration, m.time + 30))
  }

  const applyToAll = (what: 'artist-album' | 'cover' | 'sound') => {
    if (!selected) return
    setDrafts((ds) =>
      ds.map((d) => {
        if (d.key === selected.key) return d
        if (what === 'cover') return { ...d, cover: selected.cover }
        if (what === 'sound') {
          const { fadeIn, fadeOut, normalize, cleanup, gain, pitch, speed, fx } = selected.clip
          return { ...d, clip: { ...d.clip, fadeIn, fadeOut, normalize, cleanup, gain, pitch, speed, fx: { ...fx } } }
        }
        const { artist, album, year, genre } = selected.meta
        return { ...d, meta: { ...d.meta, artist, album, year, genre } }
      })
    )
    toast({ kind: 'success', title: 'Applied to all clips' })
  }

  // ---------- forging ----------
  const forge = async (key: string): Promise<boolean> => {
    const d = stateRef.current.drafts.find((x) => x.key === key)
    if (!d) return false
    if (!d.meta.title.trim()) {
      setSelectedKey(key)
      setTab('tags')
      toast({ kind: 'error', title: 'Give the song a title first' })
      return false
    }
    if ((d.clip.cleanup === 'vocals' || d.clip.cleanup === 'instrumental') && !demucsOk) {
      setSelectedKey(key)
      setTab('sound')
      toast({ kind: 'error', title: 'The AI add-on is not installed', body: 'Install Demucs from Settings → Tools, or pick a different "Voice & cleanup" option.' })
      return false
    }
    const jobId = newJobId()
    const off = api.onProgress((e) => {
      if (e.jobId === jobId) setStatus((s) => ({ ...s, [key]: { status: 'working', progress: e.percent, stage: e.stage } }))
    })
    setStatus((s) => ({ ...s, [key]: { status: 'working', progress: 1, stage: 'Starting' } }))
    try {
      const cover = await renderCover(d.cover)
      const song = await api.song.export({
        jobId,
        songId: forged[key]?.songId,
        source: { id: source.id, url: source.url, title: source.title, audioPath: source.audioPath },
        meta: { ...d.meta, title: d.meta.title.trim(), artist: d.meta.artist.trim() },
        clip: d.clip,
        cover
      })
      setForged((f) => ({ ...f, [key]: { songId: song.id, hash: draftHash(d) } }))
      setStatus((s) => ({ ...s, [key]: { status: 'idle', progress: 100, stage: 'Saved' } }))
      syncSong(song)
      return true
    } catch (e) {
      const msg = cleanError(e)
      setStatus((s) => ({ ...s, [key]: { status: 'error', progress: 0, stage: '', error: msg } }))
      toast({ kind: 'error', title: `Couldn't forge "${d.meta.title}"`, body: msg })
      return false
    } finally {
      off()
    }
  }

  const pendingKeys = drafts.filter((d) => isDirty(d)).map((d) => d.key)
  const working = Object.values(status).some((s) => s.status === 'working')

  const forgeAll = async () => {
    let ok = 0
    for (const key of pendingKeys) if (await forge(key)) ok++
    await refresh()
    if (ok) {
      toast({ kind: 'success', title: `Forged ${ok} song${ok === 1 ? '' : 's'}`, body: 'Saved to your library and Spotify folder.' })
      api.notify(`Forged ${ok} song${ok === 1 ? '' : 's'}`, 'Saved to your library and Spotify folder.')
    }
  }
  const forgeOne = async (key: string) => {
    if (await forge(key)) {
      await refresh()
      const d = stateRef.current.drafts.find((x) => x.key === key)
      toast({ kind: 'success', title: `"${d?.meta.title}" forged`, body: 'Saved to your library and Spotify folder.' })
      api.notify(`"${d?.meta.title}" is ready`, 'Saved to your library and Spotify folder.')
    }
  }

  // ---------- autosave drafts ----------
  // Only start saving once something actually changes, so merely opening a video doesn't create a draft.
  const touched = useRef(!!session)
  const firstSave = useRef(true)
  useEffect(() => {
    if (editSong) return
    if (firstSave.current) {
      firstSave.current = false
      if (!touched.current) return
    }
    touched.current = true
    const t = setTimeout(() => {
      const all = stateRef.current
      const forgedCount = all.drafts.filter((d) => forged[d.key]?.hash === draftHash(d)).length
      if (all.drafts.length > 0 && forgedCount === all.drafts.length && all.markers.length === 0) {
        // Everything is forged and nothing is pending: no draft to keep around
        api.session.delete(source.id)
        setSavedAt(Date.now())
        return
      }
      const stored: StoredDraft[] = all.drafts.map((d) => ({ ...d, songId: forged[d.key]?.songId, savedHash: forged[d.key]?.hash }))
      api.session
        .save({
          sourceId: source.id,
          url: source.url,
          title: source.title,
          channel: source.channel,
          duration: source.duration,
          thumbnailPath: source.thumbnailPath,
          drafts: stored,
          markers: all.markers,
          clipCount: all.drafts.length,
          forgedCount,
          updatedAt: Date.now()
        })
        .then(() => setSavedAt(Date.now()))
    }, 700)
    return () => clearTimeout(t)
  }, [history.state, forged, editSong, source])

  // ---------- keyboard ----------
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const typing = !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select')
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z' && !e.shiftKey) {
        if (typing) return
        e.preventDefault()
        history.undo()
        return
      }
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
        if (typing) return
        e.preventDefault()
        history.redo()
        return
      }
      if (mod && e.key === 'Enter' && selectedRef.current) {
        e.preventDefault()
        forgeOne(selectedRef.current.key)
        return
      }
      if (typing || !media || mod) return
      const sel = selectedRef.current
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (k === 'i' && sel) setEdge(sel.key, 'start', media.currentTime)
      else if (k === 'o' && sel) setEdge(sel.key, 'end', media.currentTime)
      else if (k === 'l') setLoop((v) => (writePref('sf-loop', !v), !v))
      else if (k === 'n') addClip(media.currentTime, Math.min(source.duration, media.currentTime + 30))
      else if (k === 'm') addMarker()
      else if (k === 'f') setLiveFx((v) => (writePref('sf-livefx', !v), !v))
      else if (k === '[' || k === ']') {
        const i = drafts.findIndex((d) => d.key === selectedKey)
        const next = drafts[i + (k === ']' ? 1 : -1)]
        if (next) setSelectedKey(next.key)
      } else if (e.key === 'Delete' && sel) removeClip(sel.key)
      else if (e.key === 'Home' && sel) seek(sel.clip.start)
      else if (e.key === 'End' && sel) seek(sel.clip.end - 2)
      else if (e.code === 'ArrowRight') seek(media.currentTime + (e.shiftKey ? 5 : e.altKey ? 0.1 : 1))
      else if (e.code === 'ArrowLeft') seek(media.currentTime - (e.shiftKey ? 5 : e.altKey ? 0.1 : 1))
      else if (e.key === '?') setShowKeys(true)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const waveClips: WaveClip[] = useMemo(
    () =>
      drafts.map((d) => ({
        key: d.key,
        start: d.clip.start,
        end: d.clip.end,
        color: d.color,
        label: d.meta.title || 'Untitled',
        fadeIn: d.clip.fadeIn * d.clip.speed,
        fadeOut: d.clip.fadeOut * d.clip.speed
      })),
    [drafts]
  )
  const selStatus = selected ? status[selected.key] : undefined
  const selDirty = selected ? isDirty(selected) : false
  const selForged = selected ? forged[selected.key] : undefined
  const fxActive = selected && (selected.clip.speed !== 1 || selected.clip.pitch !== 0 || selected.clip.gain !== 0 || hasFx(selected.clip.fx))
  const site = source.url.startsWith('file:') ? 'File' : siteName(source.url) ?? 'Source'

  // Layout: the clip list folds into a slim rail on narrow windows (you can toggle it)
  const narrow = useMediaQuery('(max-width: 1180px)')
  // Taller waveform on tall windows, shorter on small ones
  const tall = useMediaQuery('(min-height: 1000px)')
  const short = useMediaQuery('(max-height: 700px)')
  const waveHeight = tall ? 180 : short ? 104 : 132
  const [clipsPref, setClipsPref] = useState<boolean | null>(null)
  const clipsOpen = clipsPref ?? !narrow

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-ink-800 px-4 pr-40">
        <IconButton label="Back to Forge" className="no-drag" onClick={() => navigate({ name: 'forge' })}>
          <ArrowLeft size={18} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{editSong ? `Re-clip: ${editSong.title}` : source.title}</div>
          <div className="flex items-center gap-2 text-xs text-ink-400">
            <span className="truncate">{source.channel}</span>·<span className="font-mono">{fmtTime(source.duration)}</span>
            {site !== 'File' && (
              <button onClick={() => api.shell.openExternal(source.url)} className="no-drag inline-flex shrink-0 items-center gap-1 hover:text-ink-200">
                <ExternalLink size={11} /> {site}
              </button>
            )}
            {savedAt && !editSong && (
              <span className="inline-flex shrink-0 items-center gap-1 text-ink-500 max-[1100px]:hidden" title="Your clips are saved as a draft automatically">
                <CloudCheck size={12} /> Draft saved
              </span>
            )}
          </div>
        </div>
        <div className="no-drag flex items-center gap-1" data-tour="studio-help-group">
          <IconButton label="Undo (Ctrl+Z)" size="sm" onClick={history.undo} disabled={!history.canUndo}>
            <Undo2 size={16} />
          </IconButton>
          <IconButton label="Redo (Ctrl+Y)" size="sm" onClick={history.redo} disabled={!history.canRedo}>
            <Redo2 size={16} />
          </IconButton>
          <span data-tour="studio-help" className="flex items-center gap-1">
            <IconButton label="Keyboard shortcuts (?)" size="sm" onClick={() => setShowKeys(true)}>
              <Keyboard size={16} />
            </IconButton>
            <IconButton label="Studio tour" size="sm" onClick={() => useApp.getState().startTour('studio')}>
              <CircleHelp size={16} />
            </IconButton>
          </span>
        </div>
        {nextInQueue && nextInQueue.source?.id !== source.id && (
          <Button size="sm" variant="ghost" className="no-drag max-w-52 max-[1150px]:hidden" onClick={() => openQueued(nextInQueue.id)} title={nextInQueue.title}>
            <span className="truncate">Next: {nextInQueue.title}</span>
            <ChevronRight size={14} />
          </Button>
        )}
        <Button
          variant="primary"
          className="no-drag"
          data-tour="studio-forge-all"
          disabled={!pendingKeys.length || working}
          onClick={forgeAll}
          icon={working ? <Loader2 size={16} className="animate-spin" /> : <SmithHammer size={17} />}
        >
          {working ? 'Forging…' : !pendingKeys.length ? 'All forged' : drafts.length > 1 ? `Forge all (${pendingKeys.length})` : 'Forge song'}
        </Button>
      </header>

      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `${clipsOpen ? 'clamp(208px, 17vw, 264px)' : '56px'} minmax(0, 1fr) clamp(312px, 26vw, 380px)` }}
      >
        {/* Left: clips + markers */}
        {!clipsOpen ? (
          <aside data-tour="studio-clips" className="flex min-h-0 flex-col items-center gap-1 border-r border-ink-800 py-3">
            <IconButton label="Show the clip list" size="sm" onClick={() => setClipsPref(true)}>
              <ChevronsRight size={15} />
            </IconButton>
            <IconButton label="Find songs in this video" size="sm" data-tour="studio-suggest" onClick={() => runSuggest()}>
              <Wand2 size={15} />
            </IconButton>
            <IconButton label="New clip at playhead (N)" size="sm" onClick={() => addClip(time, Math.min(source.duration, time + 30))}>
              <Plus size={16} />
            </IconButton>
            <div className="my-1 h-px w-6 bg-ink-700" />
            <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
              {drafts.map((d, i) => (
                <button
                  key={d.key}
                  onClick={() => setSelectedKey(d.key)}
                  title={`${i + 1}. ${d.meta.title || 'Untitled'}`}
                  className={cx(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-bold text-white transition',
                    d.key === selectedKey ? 'ring-2 ring-ink-100' : 'opacity-75 hover:opacity-100'
                  )}
                  style={{ background: d.color }}
                >
                  {forged[d.key] && !isDirty(d) ? <Check size={13} /> : i + 1}
                </button>
              ))}
            </div>
          </aside>
        ) : (
        <aside data-tour="studio-clips" className="flex min-h-0 flex-col border-r border-ink-800">
          <div className="flex items-center justify-between pl-4 pr-2 pt-3 pb-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              Clips <span className="ml-1 text-ink-500">{drafts.length}</span>
            </h3>
            <div className="flex">
              <IconButton label="Find songs in this video (suggest clips)" size="sm" data-tour="studio-suggest" onClick={() => runSuggest()}>
                <Wand2 size={15} />
              </IconButton>
              {source.chapters.length > 0 && (
                <IconButton label="Add a clip per chapter" size="sm" onClick={addFromChapters}>
                  <ListPlus size={15} />
                </IconButton>
              )}
              <IconButton label="New clip at playhead (N)" size="sm" onClick={() => addClip(time, Math.min(source.duration, time + 30))}>
                <Plus size={16} />
              </IconButton>
              <IconButton label="Hide the clip list" size="sm" onClick={() => setClipsPref(false)}>
                <ChevronsLeft size={15} />
              </IconButton>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {drafts.map((d, i) => {
              const st = status[d.key]
              const dirty = isDirty(d)
              const done = !!forged[d.key] && !dirty
              return (
                <div
                  key={d.key}
                  onClick={() => setSelectedKey(d.key)}
                  onDoubleClick={() => playRange(d.clip.start, d.clip.end)}
                  className={cx('group relative mb-1 flex cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 transition', d.key === selectedKey ? 'bg-ink-800' : 'hover:bg-ink-850')}
                >
                  <span className="w-1 shrink-0 self-stretch rounded-full" style={{ background: d.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium">
                        {i + 1}. {d.meta.title || 'Untitled'}
                      </span>
                      {done && <Check size={13} className="shrink-0 text-emerald-500" />}
                      {st?.status === 'error' && <AlertTriangle size={13} className="shrink-0 text-red-400" />}
                      {forged[d.key] && dirty && st?.status !== 'working' && <span className="size-1.5 shrink-0 rounded-full bg-amber-400" title="Changed since last forge" />}
                    </div>
                    <div className="font-mono text-[10.5px] text-ink-400">
                      {fmtTime(d.clip.start)}–{fmtTime(d.clip.end)} · {fmtTime((d.clip.end - d.clip.start) / d.clip.speed)}
                      {(d.clip.speed !== 1 || d.clip.pitch !== 0 || hasFx(d.clip.fx)) && <span className="ml-1 text-ember-400">FX</span>}
                      {d.clip.cleanup === 'instrumental' && <span className="ml-1 text-sky-400">INST</span>}
                    </div>
                    {st?.status === 'working' && <ProgressBar value={st.progress} className="mt-1.5 h-1" />}
                  </div>
                  <div className="absolute right-1 top-1 hidden gap-0.5 rounded-md bg-ink-800 group-hover:flex">
                    <IconButton label="Play clip" size="sm" onClick={(e) => (e.stopPropagation(), playRange(d.clip.start, d.clip.end))}>
                      <Play size={12} fill="currentColor" />
                    </IconButton>
                    <IconButton label="Duplicate (e.g. for a sped-up version)" size="sm" onClick={(e) => (e.stopPropagation(), duplicateClip(d.key))}>
                      <Copy size={12} />
                    </IconButton>
                    {d.clip.cleanup !== 'instrumental' && (
                      <IconButton label="Make an instrumental (karaoke) version" size="sm" onClick={(e) => (e.stopPropagation(), instrumentalVersion(d.key))}>
                        <Piano size={12} />
                      </IconButton>
                    )}
                    <IconButton label="Delete clip" size="sm" disabled={st?.status === 'working'} onClick={(e) => (e.stopPropagation(), removeClip(d.key))}>
                      <Trash2 size={12} />
                    </IconButton>
                  </div>
                </div>
              )
            })}
            {!drafts.length && (
              <div className="flex flex-col items-center gap-3 p-4 text-center text-xs leading-relaxed text-ink-400">
                Drag across the waveform or press N to create a clip.
                <Button size="sm" icon={<Wand2 size={13} />} onClick={() => runSuggest()}>
                  Find songs for me
                </Button>
              </div>
            )}
          </div>

          <div className="border-t border-ink-800">
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                Markers <span className="ml-1 text-ink-500">{markers.length}</span>
              </h3>
              <IconButton label="Drop marker at playhead (M)" size="sm" onClick={addMarker}>
                <Bookmark size={14} />
              </IconButton>
            </div>
            <div className="max-h-40 overflow-y-auto px-2 pb-3">
              {markers.length === 0 ? (
                <p className="px-2 py-1 text-[11px] leading-relaxed text-ink-500">Press M while listening to mark where songs start. Turn markers into clips with one click.</p>
              ) : (
                markers.map((m) => (
                  <div key={m.id} className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-ink-850">
                    <span className="size-2 rotate-45 bg-yellow-400" />
                    <button className="flex-1 text-left font-mono text-xs text-ink-200" onClick={() => seek(m.time)}>
                      {m.label} · {fmtTime(m.time, true)}
                    </button>
                    <button className="hidden text-ink-400 hover:text-ink-100 group-hover:block" title="Clip from here to the next marker" onClick={() => clipFromMarker(m)}>
                      <Scissors size={12} />
                    </button>
                    <button className="hidden text-ink-400 hover:text-red-400 group-hover:block" title="Delete marker" onClick={() => setMarkers((ms) => ms.filter((x) => x.id !== m.id))}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
        )}

        {/* Center: video, transport, waveform */}
        <section className="@container flex min-h-0 min-w-0 flex-col gap-3 p-4">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-black">
            {source.videoPath ? (
              <video ref={mediaRef} crossOrigin="anonymous" src={mediaUrl(source.videoPath)} className="absolute inset-0 size-full object-contain" playsInline onClick={togglePlay} />
            ) : (
              <>
                {source.thumbnailPath && <img src={mediaUrl(source.thumbnailPath)} alt="" className="absolute inset-0 size-full object-contain opacity-60" />}
                <audio ref={mediaRef} crossOrigin="anonymous" src={mediaUrl(source.audioPath)} />
              </>
            )}
            {fxActive && (
              <div className={cx('absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur', liveFx ? 'bg-ember-500/85 text-on-accent' : 'bg-black/60 text-white/70')}>
                {liveFx ? 'Live FX' : 'Live FX off'} · {selected.clip.speed}× · {selected.clip.pitch > 0 ? '+' : ''}
                {selected.clip.pitch} st{selected.clip.gain ? ` · ${selected.clip.gain > 0 ? '+' : ''}${selected.clip.gain} dB` : ''}
                {hasFx(selected.clip.fx) ? ' · FX' : ''}
              </div>
            )}
          </div>

          <div data-tour="studio-transport" className="flex shrink-0 items-center gap-1.5">
            <IconButton label="Jump to clip start (Home)" size="sm" onClick={() => selected && seek(selected.clip.start)} disabled={!selected}>
              <SkipBack size={15} fill="currentColor" />
            </IconButton>
            <button
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
              className="flex size-10 items-center justify-center rounded-full bg-ink-100 text-ink-950 transition hover:scale-105 active:scale-95"
            >
              {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="ml-0.5" />}
            </button>
            <IconButton label="Jump near clip end (End)" size="sm" onClick={() => selected && seek(selected.clip.end - 2)} disabled={!selected}>
              <SkipForward size={15} fill="currentColor" />
            </IconButton>
            <TimeReadout media={media} duration={source.duration} clipStart={selected?.clip.start} />
            <div className="mx-1 h-6 w-px bg-ink-700 @max-[520px]:hidden" />
            <ToggleChip on={loop} onClick={() => setLoop((v) => (writePref('sf-loop', !v), !v))} icon={<Repeat size={13} />} label="Loop" title="Loop the selected clip (L)" />
            <ToggleChip on={liveFx} onClick={() => setLiveFx((v) => (writePref('sf-livefx', !v), !v))} icon={<Sparkles size={13} />} label="Live FX" title="Hear speed, pitch, gain and fades while editing (F)" />
            <ToggleChip on={autoSnap} onClick={() => setAutoSnap((v) => (writePref('sf-autosnap', !v), !v))} icon={<Magnet size={13} />} label="Snap" title="Snap edges to quiet spots when you drag them" />
            <div className="mx-1 h-6 w-px bg-ink-700 @max-[560px]:hidden" />
            <span className="contents @max-[560px]:hidden">
            <IconButton label="Set clip start to playhead (I)" size="sm" onClick={() => selected && setEdge(selected.key, 'start', time)} disabled={!selected}>
              <span className="font-mono text-[11px] font-bold">[</span>
            </IconButton>
            <IconButton label="Set clip end to playhead (O)" size="sm" onClick={() => selected && setEdge(selected.key, 'end', time)} disabled={!selected}>
              <span className="font-mono text-[11px] font-bold">]</span>
            </IconButton>
            <IconButton label="Drop a marker (M)" size="sm" onClick={addMarker}>
              <Bookmark size={14} />
            </IconButton>
            </span>
          </div>

          {suggestBanner && suggestions && (
            <div className="flex shrink-0 items-center gap-3 rounded-xl border border-ember-500/40 bg-ember-500/10 px-4 py-2.5">
              <Wand2 size={16} className="shrink-0 text-ember-400" />
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">
                  Found {suggestions.length} songs in this video
                </span>
                <span className="text-ink-300 @max-[640px]:hidden"> · {suggestions[0].from === 'chapters' ? 'from its chapters' : 'by listening for music'}</span>
              </div>
              <Button size="sm" variant="primary" onClick={() => setShowSuggest(true)}>
                Review
              </Button>
              <IconButton label="Dismiss" size="sm" onClick={() => setSuggestBanner(false)}>
                <X size={14} />
              </IconButton>
            </div>
          )}

          <div className="shrink-0" data-tour="studio-waveform">
            <Waveform
              media={media}
              peaks={source.peaks}
              duration={source.duration}
              clips={waveClips}
              markers={markers}
              selectedKey={selectedKey}
              zoom={zoom}
              height={waveHeight}
              onChange={(key, start, end, side) => {
                let s = start
                let e = end
                if (autoSnap && side === 'start') s = snapToQuiet(source.peaks, source.peaksPerSecond, start)
                if (autoSnap && side === 'end') e = snapToQuiet(source.peaks, source.peaksPerSecond, end)
                updateDraft(key, (d) => ({ clip: { ...d.clip, start: s, end: e } }), `${key}:range`)
                setSelectedKey(key)
              }}
              onSelect={setSelectedKey}
              onCreate={(s, e) => addClip(s, e)}
              onMarkerMove={(id, t) => setMarkers((ms) => ms.map((m) => (m.id === id ? { ...m, time: t } : m)), `${id}:move`)}
              toolbar={
                <div className="flex w-36 shrink-0 items-center gap-2">
                  <button onClick={() => setZoom(0)} className="text-ink-400 hover:text-ink-100" title="Zoom to fit">
                    <ZoomIn size={14} />
                  </button>
                  <Range label="Zoom" value={zoom} min={0} max={300} step={1} onChange={setZoom} />
                </div>
              }
            />
          </div>
        </section>

        {/* Right: inspector */}
        <aside className="flex min-h-0 flex-col border-l border-ink-800 bg-ink-850/40">
          {selected ? (
            <>
              <Inspector
                tab={tab}
                onTab={setTab}
                draft={selected}
                index={selectedIndex}
                clipCount={drafts.length}
                duration={source.duration}
                playhead={time}
                peaks={source.peaks}
                perSecond={source.peaksPerSecond}
                video={media instanceof HTMLVideoElement ? media : null}
                thumbnailPath={source.thumbnailPath}
                demucsOk={demucsOk}
                onClip={(patch, group) => updateClip(selected.key, patch, group)}
                onMeta={(k, v) => updateDraft(selected.key, (d) => ({ meta: { ...d.meta, [k]: v } }), `${selected.key}:meta.${k}`)}
                onLyrics={(lyrics, syncedLyrics) => updateDraft(selected.key, (d) => ({ meta: { ...d.meta, lyrics, syncedLyrics } }), `${selected.key}:lyrics`)}
                onCover={(cover) => updateDraft(selected.key, () => ({ cover }), `${selected.key}:cover`)}
                onSnap={(edge) => snapEdge(selected.key, edge)}
                onToPlayhead={(edge) => setEdge(selected.key, edge, time)}
                onPreviewEdge={(edge) =>
                  edge === 'start'
                    ? playRange(selected.clip.start, Math.min(selected.clip.end, selected.clip.start + 3))
                    : playRange(Math.max(selected.clip.start, selected.clip.end - 3), selected.clip.end)
                }
                onAutofill={() => updateDraft(selected.key, (d) => ({ meta: { ...d.meta, title: guess.title, artist: guess.artist, year: guess.year } }))}
                onApplyToAll={applyToAll}
              />
              <div className="shrink-0 border-t border-ink-800 p-4" data-tour="studio-forge">
                {selStatus?.status === 'working' ? (
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span>{selStatus.stage}…</span>
                      <span className="font-mono text-ink-400">{Math.round(selStatus.progress)}%</span>
                    </div>
                    <ProgressBar value={selStatus.progress} />
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      className="flex-1"
                      onClick={() => forgeOne(selected.key)}
                      disabled={!selDirty}
                      icon={selDirty ? <SmithHammer size={17} /> : <Check size={16} />}
                      title="Ctrl+Enter"
                    >
                      {!selDirty ? 'Forged' : selForged ? 'Save changes' : 'Forge this clip'}
                    </Button>
                    {selForged && !selDirty && (
                      <IconButton
                        label="Play in SongForge"
                        onClick={() => {
                          const lib = useApp.getState().library.songs
                          const i = lib.findIndex((s) => s.id === selForged.songId)
                          if (i >= 0) usePlayer.getState().playSongs(lib, i)
                        }}
                      >
                        <Play size={16} fill="currentColor" />
                      </IconButton>
                    )}
                  </div>
                )}
                {selStatus?.status === 'error' && <p className="mt-2 text-xs text-red-400">{selStatus.error}</p>}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-ink-400">
              <Scissors size={28} />
              Select a clip, or drag across the waveform to make one.
            </div>
          )}
        </aside>
      </div>

      <ShortcutsDialog open={showKeys} onClose={() => setShowKeys(false)} />
      <SuggestDialog
        open={showSuggest}
        suggestions={suggestions ?? []}
        onClose={() => setShowSuggest(false)}
        onPreview={(sg) => playRange(sg.start, sg.end)}
        onAdd={addSuggestions}
      />
    </div>
  )
}

function ToggleChip({ on, onClick, icon, label, title }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={cx(
        'flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition',
        on ? 'border-ember-500/50 bg-ember-500/10 text-ember-400' : 'border-ink-600 text-ink-400 hover:text-ink-200'
      )}
    >
      {icon}
      <span className="@max-[600px]:hidden">{label}</span>
    </button>
  )
}

function SuggestDialog({
  open,
  suggestions,
  onClose,
  onPreview,
  onAdd
}: {
  open: boolean
  suggestions: Suggestion[]
  onClose: () => void
  onPreview: (s: Suggestion) => void
  onAdd: (s: Suggestion[]) => void
}) {
  const [picked, setPicked] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (open) setPicked(new Set(suggestions.map((_, i) => i)))
  }, [open, suggestions])
  const toggle = (i: number) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  return (
    <Modal open={open} onClose={onClose} title="Songs found in this video" width="max-w-lg">
      {suggestions.length === 0 ? (
        <div className="py-6 text-center text-sm text-ink-400">
          <p>No clear songs were found. This works best on live stages and streams with pauses between songs.</p>
          <p className="mt-2">Drag across the waveform to make a clip yourself, or press M while listening to mark where songs start.</p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-ink-400">
            {suggestions[0].from === 'chapters'
              ? "These come from the video's chapters."
              : 'SongForge listened for stretches of music between quieter parts like talking. Check the edges after adding them.'}
          </p>
          <div className="flex flex-col gap-1.5">
            {suggestions.map((sg, i) => (
              <label key={i} className="flex cursor-pointer items-center gap-3 rounded-lg border border-ink-700 px-3 py-2 hover:bg-ink-800">
                <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} className="size-4 accent-[var(--color-ember-500)]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{sg.title ?? `Song ${i + 1}`}</div>
                  <div className="font-mono text-[11px] text-ink-400">
                    {fmtTime(sg.start)} – {fmtTime(sg.end)} · {fmtTime(sg.end - sg.start)}
                  </div>
                </div>
                {sg.from === 'audio' && (
                  <span className="h-1.5 w-12 overflow-hidden rounded-full bg-ink-700" title={`Confidence ${Math.round(sg.confidence * 100)}%`}>
                    <span className="block h-full rounded-full bg-ember-500" style={{ width: `${Math.round(sg.confidence * 100)}%` }} />
                  </span>
                )}
                <IconButton
                  label="Listen"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault()
                    onPreview(sg)
                  }}
                >
                  <Play size={12} fill="currentColor" />
                </IconButton>
              </label>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!picked.size} onClick={() => onAdd(suggestions.filter((_, i) => picked.has(i)))} icon={<Plus size={15} />}>
              Add {picked.size} clip{picked.size === 1 ? '' : 's'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

/** Smooth time display that updates every frame without re-rendering the editor. */
function TimeReadout({ media, duration, clipStart }: { media: HTMLMediaElement | null; duration: number; clipStart?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const relRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const t = media?.currentTime ?? 0
      if (ref.current) ref.current.textContent = fmtTime(t, true)
      if (relRef.current) relRef.current.textContent = clipStart != null ? `clip ${t >= clipStart ? '+' : '−'}${fmtTime(Math.abs(t - clipStart), true)}` : ''
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [media, clipStart])
  return (
    <div className="ml-1 flex w-32 flex-col leading-tight">
      <span className="font-mono text-[13px] tabular-nums">
        <span ref={ref}>0:00.00</span> <span className="text-ink-500">/ {fmtTime(duration)}</span>
      </span>
      <span ref={relRef} className="font-mono text-[10px] tabular-nums text-ink-400" title="Time relative to the clip start" />
    </div>
  )
}

function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rows: Array<[string, string]> = [
    ['Space', 'Play / pause'],
    ['I / O', 'Set clip start / end at playhead'],
    ['N', 'New clip at playhead'],
    ['M', 'Drop a marker'],
    ['L', 'Toggle loop'],
    ['F', 'Toggle live FX preview'],
    ['[ / ]', 'Previous / next clip'],
    ['Delete', 'Delete selected clip'],
    ['Home / End', 'Jump to clip start / end'],
    ['← / →', 'Seek 1s (Shift 5s, Alt 0.1s)'],
    ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
    ['Ctrl+Enter', 'Forge selected clip'],
    ['↑ / ↓', 'Nudge 0.01s in a time box (Shift 0.1s)']
  ]
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" width="max-w-md">
      <div className="flex flex-col divide-y divide-ink-700">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-2 text-sm">
            <span className="text-ink-300">{v}</span>
            <span className="flex gap-1">
              {k.split(' / ').map((part) => (
                <Kbd key={part}>{part}</Kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  )
}
