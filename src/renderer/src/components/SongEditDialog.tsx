import { useEffect, useState } from 'react'
import { Loader2, Save, Scissors, Trash2 } from 'lucide-react'
import type { SongMeta } from '@shared/types'
import { api, mediaUrl } from '@/lib/api'
import { useApp } from '@/lib/store'
import { usePlayer } from '@/lib/player'
import { fmtTime } from '@/lib/format'
import { Button, Field, Input, Modal, cx } from './ui'
import { LyricsPanel } from './LyricsPanel'
import { CoverCropper, emptyCover, renderCover, type CoverState } from './CoverCropper'
import { reclip, removeSong } from './SongActions'

export function SongEditDialog() {
  const song = useApp((s) => s.editingSong)
  const close = () => useApp.getState().editSong(null)
  const [meta, setMeta] = useState<SongMeta | null>(null)
  const [cover, setCover] = useState<CoverState>(emptyCover)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'details' | 'lyrics'>('details')

  useEffect(() => {
    if (!song) return
    const { title, artist, album, year, genre, lyrics, syncedLyrics } = song
    setMeta({ title, artist, album, year, genre, lyrics, syncedLyrics: syncedLyrics ?? '' })
    setTab('details')
    setCover(
      song.coverPath
        ? { kind: 'existing', src: mediaUrl(song.coverPath, song.updatedAt), path: song.coverPath, panX: 0.5, panY: 0.5, zoom: 1 }
        : emptyCover
    )
  }, [song])

  if (!song || !meta) return null
  const set = (k: keyof SongMeta, v: string) => setMeta({ ...meta, [k]: v })

  const save = async () => {
    if (!meta.title.trim()) return
    setSaving(true)
    try {
      const c = await renderCover(cover)
      const updated = await api.song.retag(song.id, { ...meta, title: meta.title.trim() }, c)
      usePlayer.getState().syncSong(updated)
      await useApp.getState().refresh()
      useApp.getState().toast({ kind: 'success', title: 'Song updated', body: 'Tags and cover were rewritten in the MP3.' })
      close()
    } catch (e) {
      useApp.getState().toast({ kind: 'error', title: 'Could not save', body: String((e as Error).message) })
    }
    setSaving(false)
  }

  return (
    <Modal open onClose={close} title="Edit song" width="max-w-3xl">
      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3">
          <CoverCropper value={cover} onChange={setCover} size={220} />
          <div className="w-[220px] rounded-lg bg-ink-800 p-3 text-xs text-ink-400">
            <div>{song.imported ? `Imported · ${fmtTime(song.duration)}` : `Clip ${fmtTime(song.start)} – ${fmtTime(song.end)}`}</div>
            <div className="mt-1 line-clamp-2">from {song.sourceTitle}</div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 rounded-lg bg-ink-800 p-0.5">
            {(['details', 'lyrics'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cx('h-7 rounded-md text-xs font-medium capitalize transition', tab === t ? 'bg-ink-600 text-ink-100 shadow' : 'text-ink-400 hover:text-ink-200')}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === 'lyrics' ? (
            <LyricsPanel
              title={meta.title}
              artist={meta.artist}
              lyrics={meta.lyrics}
              syncedLyrics={meta.syncedLyrics}
              duration={song.duration}
              rows={11}
              onChange={(lyrics, syncedLyrics) => setMeta({ ...meta, lyrics, syncedLyrics })}
            />
          ) : (
          <>
          <Field label="Title">
            <Input value={meta.title} onChange={(e) => set('title', e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Artist">
              <Input value={meta.artist} onChange={(e) => set('artist', e.target.value)} />
            </Field>
            <Field label="Album">
              <Input value={meta.album} onChange={(e) => set('album', e.target.value)} />
            </Field>
            <Field label="Year">
              <Input value={meta.year} onChange={(e) => set('year', e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </Field>
            <Field label="Genre">
              <Input value={meta.genre} onChange={(e) => set('genre', e.target.value)} />
            </Field>
          </div>
          </>
          )}
        </div>
      </div>
      <div className="mt-6 flex items-center gap-2 border-t border-ink-700 pt-5">
        <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => (close(), removeSong(song))}>
          Delete
        </Button>
        <Button variant="ghost" size="sm" icon={<Scissors size={14} />} onClick={() => (close(), reclip(song))}>
          Re-clip audio
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={saving || !meta.title.trim()} icon={saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}>
          Save
        </Button>
      </div>
    </Modal>
  )
}
