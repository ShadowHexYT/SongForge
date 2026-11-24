import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, X } from 'lucide-react'
import type { Song } from '@shared/types'
import { api, newJobId } from '@/lib/api'
import { useApp } from '@/lib/store'
import { cleanError } from '@/lib/queue'
import { fmtTime } from '@/lib/format'
import { Button, Cover, Field, IconButton, Input, Modal, ProgressBar, Range, Toggle } from './ui'
import { SongChecklist } from './SongChecklist'
import { SmithHammer } from './ForgeIcons'

/** Join several songs into one track with crossfades. */
export function MedleyDialog({ songIds: initial }: { songIds: string[] }) {
  const close = () => useApp.getState().openSheet(null)
  const songs = useApp((s) => s.library.songs)
  const toast = useApp((s) => s.toast)
  const [ids, setIds] = useState(initial)
  const [crossfade, setCrossfade] = useState(3)
  const [normalize, setNormalize] = useState(true)
  const [fadeOut, setFadeOut] = useState(true)
  const [title, setTitle] = useState('Medley')
  const [artist, setArtist] = useState('')
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(0)
  const job = useRef('')
  const artistTouched = useRef(false)

  useEffect(() => api.onProgress((e) => e.jobId === job.current && setPct(e.percent)), [])

  const picked = useMemo(() => ids.map((id) => songs.find((s) => s.id === id)).filter((s): s is Song => !!s), [ids, songs])
  // Suggest the artist when every song shares one
  useEffect(() => {
    if (artistTouched.current) return
    const a = [...new Set(picked.map((s) => s.artist).filter(Boolean))]
    setArtist(a.length === 1 ? a[0] : picked.length ? 'Various Artists' : '')
  }, [picked])

  const length = picked.reduce((a, s) => a + s.duration, 0) - Math.max(0, picked.length - 1) * crossfade
  const move = (i: number, d: -1 | 1) => {
    const next = [...ids]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    setIds(next)
  }

  const forge = async () => {
    setBusy(true)
    setPct(0)
    job.current = newJobId()
    try {
      const song = await api.song.medley({ jobId: job.current, songIds: ids, crossfade, normalize, fadeOut, title, artist, album: '' })
      await useApp.getState().refresh()
      toast({ kind: 'success', title: 'Medley forged', body: `${song.title} · ${fmtTime(song.duration)}` })
      api.notify('Medley forged', song.title)
      close()
    } catch (e) {
      toast({ kind: 'error', title: "Couldn't make the medley", body: cleanError(e) })
    }
    setBusy(false)
  }

  return (
    <Modal open onClose={() => !busy && close()} title="Make a medley" width="max-w-4xl">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">1 · Pick songs</div>
          <SongChecklist selected={ids} onChange={setIds} height={360} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">2 · Order</div>
          <div className="h-[200px] overflow-y-auto rounded-xl border border-ink-700 bg-ink-900/50 p-1">
            {picked.map((s, i) => (
              <div key={s.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-800">
                <span className="w-5 shrink-0 text-center font-mono text-xs text-ink-400">{i + 1}</span>
                <Cover path={s.coverPath} seed={s.id} size={30} bust={s.updatedAt} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{s.title}</span>
                <span className="font-mono text-[11px] text-ink-400">{fmtTime(s.duration)}</span>
                <IconButton label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={14} />
                </IconButton>
                <IconButton label="Move down" size="sm" disabled={i === picked.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown size={14} />
                </IconButton>
                <IconButton label="Remove" size="sm" onClick={() => setIds(ids.filter((x) => x !== s.id))}>
                  <X size={14} />
                </IconButton>
              </div>
            ))}
            {!picked.length && <p className="px-4 py-16 text-center text-sm text-ink-400">Tick songs on the left. They play in the order you pick them.</p>}
          </div>
          <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">3 · Mix</div>
          <div className="flex flex-col gap-3 rounded-xl border border-ink-700 p-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0">Crossfade · {crossfade ? `${crossfade}s` : 'off'}</span>
              <Range value={crossfade} max={8} step={0.5} onChange={setCrossfade} label="Crossfade" />
            </div>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Same loudness for every song</span>
              <Toggle checked={normalize} onChange={setNormalize} label="Same loudness" />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Fade out at the end</span>
              <Toggle checked={fadeOut} onChange={setFadeOut} label="Fade out" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Artist">
              <Input
                value={artist}
                onChange={(e) => {
                  artistTouched.current = true
                  setArtist(e.target.value)
                }}
              />
            </Field>
          </div>
        </div>
      </div>
      {busy && <ProgressBar value={pct} className="mt-5" />}
      <div className="mt-5 flex items-center gap-3 border-t border-ink-700 pt-5">
        <span className="flex-1 text-xs text-ink-400">
          {picked.length} song{picked.length === 1 ? '' : 's'}
          {picked.length > 1 && ` · about ${fmtTime(Math.max(0, length))}`}
        </span>
        <Button variant="ghost" onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={forge}
          disabled={picked.length < 2 || busy || !title.trim()}
          icon={busy ? <Loader2 size={16} className="animate-spin" /> : <SmithHammer size={17} />}
        >
          Forge medley
        </Button>
      </div>
    </Modal>
  )
}
