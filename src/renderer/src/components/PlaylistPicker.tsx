import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, ListVideo, Loader2, Search } from 'lucide-react'
import type { PlaylistInfo } from '@shared/types'
import { siteName } from '@shared/sites'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { cleanError, useQueue } from '@/lib/queue'
import { fmtDuration, fmtTime } from '@/lib/format'
import { Button, Modal, cx } from './ui'

const videoId = (url: string) => url.match(/(?:v=|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/)?.[1]

/** Pick which videos of a playlist or channel to queue. */
export function PlaylistPicker({ urls }: { urls: string[] }) {
  const url = urls[0]
  const close = () => {
    const rest = urls.slice(1)
    useApp.getState().openSheet(rest.length ? { kind: 'playlist', urls: rest } : null)
  }
  const songs = useApp((s) => s.library.songs)
  const toast = useApp((s) => s.toast)
  const [info, setInfo] = useState<PlaylistInfo | null>(null)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')

  // Videos you've already forged songs from
  const forged = useMemo(() => {
    const s = new Set<string>()
    for (const x of songs) {
      s.add(x.sourceUrl)
      const id = videoId(x.sourceUrl) ?? (x.sourceId && /^[A-Za-z0-9_-]{11}$/.test(x.sourceId) ? x.sourceId : null)
      if (id) s.add(id)
    }
    return s
  }, [songs])
  const isForged = (u: string) => forged.has(u) || forged.has(videoId(u) ?? '\0')

  useEffect(() => {
    let live = true
    setInfo(null)
    setError('')
    api.source
      .playlist(url)
      .then((i) => {
        if (!live) return
        setInfo(i)
        // Short playlists start fully ticked; long ones (whole channels) start empty so nothing huge queues by accident
        setPicked(new Set(i.entries.length <= 50 ? i.entries.filter((e) => !isForged(e.url)).map((e) => e.url) : []))
      })
      .catch((e) => live && setError(cleanError(e)))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return (info?.entries ?? []).filter((e) => !n || e.title.toLowerCase().includes(n))
  }, [info, q])
  const chosen = (info?.entries ?? []).filter((e) => picked.has(e.url))
  const total = chosen.reduce((a, e) => a + e.duration, 0)
  const toggle = (u: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(u)) next.delete(u)
      else next.add(u)
      return next
    })
  const allShown = shown.length > 0 && shown.every((e) => picked.has(e.url))

  const queueThem = () => {
    useQueue.getState().add(chosen.map((e) => ({ url: e.url, title: e.title, thumbnail: e.thumbnail })))
    toast({ kind: 'info', title: `Queued ${chosen.length} video${chosen.length === 1 ? '' : 's'}`, body: 'They download one at a time. Open each one when it’s ready.' })
    const st = useApp.getState()
    if (st.route.name !== 'forge' && st.route.name !== 'editor') st.navigate({ name: 'forge' })
    close()
  }

  return (
    <Modal open onClose={close} title={info ? info.title : `Opening ${siteName(url) ?? ''} playlist…`} width="max-w-2xl">
      {!info && !error && (
        <div className="flex flex-col items-center gap-3 py-16 text-sm text-ink-400">
          <Loader2 size={26} className="animate-spin text-ember-400" />
          Reading the list of videos…
        </div>
      )}
      {error && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle size={30} className="text-red-400" />
          <div className="font-semibold">Couldn't open this playlist</div>
          <p className="max-w-sm text-sm text-ink-400">{error}</p>
          <Button className="mt-2" onClick={close}>
            Close
          </Button>
        </div>
      )}
      {info && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-400">
            <ListVideo size={16} className="text-ember-400" />
            <span className="min-w-0 flex-1">
              {info.channel && <b className="text-ink-200">{info.channel} · </b>}
              {info.entries.length} video{info.entries.length === 1 ? '' : 's'}
              {info.truncated && ' (the first 500)'}
              {info.entries.length > 50 && !picked.size && ' · tick the ones you want'}
            </span>
            <div className="relative w-56">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter"
                className="h-8 w-full rounded-full border border-ink-600 bg-ink-800 pl-8 pr-3 text-sm outline-none focus:border-ember-500/60"
              />
            </div>
            <button
              className="text-xs font-medium text-ink-300 hover:text-ink-100"
              onClick={() =>
                setPicked((prev) => {
                  const next = new Set(prev)
                  for (const e of shown) {
                    if (allShown) next.delete(e.url)
                    else next.add(e.url)
                  }
                  return next
                })
              }
            >
              {allShown ? 'Select none' : 'Select all'}
            </button>
          </div>
          <div className="max-h-[52vh] overflow-y-auto rounded-xl border border-ink-700 bg-ink-900/50 p-1">
            {shown.map((e) => {
              const on = picked.has(e.url)
              const done = isForged(e.url)
              return (
                <button
                  key={e.url}
                  onClick={() => toggle(e.url)}
                  aria-pressed={on}
                  className={cx('flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition', on ? 'bg-ember-500/10' : 'hover:bg-ink-800')}
                >
                  <span className={cx('flex size-5 shrink-0 items-center justify-center rounded-md border', on ? 'border-ember-500 bg-ember-500 text-on-accent' : 'border-ink-500')}>
                    {on && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="relative aspect-video w-20 shrink-0 overflow-hidden rounded bg-ink-800">
                    {e.thumbnail && <img src={e.thumbnail} alt="" loading="lazy" className="size-full object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[13px] font-medium leading-snug">{e.title}</span>
                    {done && <span className="text-[11px] text-emerald-400">Already in your library</span>}
                  </span>
                  {e.duration > 0 && <span className="shrink-0 font-mono text-[11px] text-ink-400">{fmtTime(e.duration)}</span>}
                </button>
              )
            })}
            {!shown.length && <p className="py-10 text-center text-sm text-ink-400">Nothing matches “{q}”.</p>}
          </div>
          <div className="flex items-center gap-3 pt-2">
            <span className="flex-1 text-xs text-ink-400">
              {chosen.length} selected{total > 0 && ` · ${fmtDuration(total)}`}
            </span>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!chosen.length} onClick={queueThem} icon={<ListVideo size={16} />}>
              Queue {chosen.length || ''} video{chosen.length === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
