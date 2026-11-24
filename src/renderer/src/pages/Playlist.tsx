import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, ListMusic, MoreHorizontal, Play, Plus, Search, Shuffle, Trash2, Package, Combine } from 'lucide-react'
import { api, mediaUrl } from '@/lib/api'
import { useApp } from '@/lib/store'
import { usePlayer } from '@/lib/player'
import { fmtDuration, fmtTime } from '@/lib/format'
import { Button, Cover, IconButton, cx } from '@/components/ui'
import { SongTable } from '@/components/SongList'
import { EmptyState } from '@/components/EmptyState'
import type { Song } from '@shared/types'

export function PlaylistPage({ id }: { id: string }) {
  const library = useApp((s) => s.library)
  const refresh = useApp((s) => s.refresh)
  const navigate = useApp((s) => s.navigate)
  const toast = useApp((s) => s.toast)
  const playSongs = usePlayer((s) => s.playSongs)
  const pl = library.playlists.find((p) => p.id === id)
  const [name, setName] = useState(pl?.name ?? '')
  const [q, setQ] = useState('')
  useEffect(() => setName(pl?.name ?? ''), [pl?.name])

  const songs = useMemo(
    () => (pl ? pl.songIds.map((sid) => library.songs.find((s) => s.id === sid)).filter((s): s is Song => !!s) : []),
    [pl, library.songs]
  )
  const candidates = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return library.songs
      .filter((s) => !pl?.songIds.includes(s.id))
      .filter((s) => !needle || `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(needle))
      .slice(0, 12)
  }, [library.songs, pl, q])

  if (!pl) return <div className="p-10 text-sm text-ink-400">Playlist not found.</div>

  const rename = async () => {
    const n = name.trim()
    if (n && n !== pl.name) {
      await api.playlist.update(pl.id, { name: n })
      await refresh()
    } else setName(pl.name)
  }
  const add = async (sid: string) => {
    await api.playlist.update(pl.id, { songIds: [...pl.songIds, sid] })
    await refresh()
  }
  const del = async () => {
    if (!confirm(`Delete playlist "${pl.name}"? Songs stay in your library.`)) return
    await api.playlist.delete(pl.id)
    await refresh()
    navigate({ name: 'library' })
  }
  const exportM3U = async () => {
    if (await api.playlist.exportM3U(pl.id)) toast({ kind: 'success', title: 'Playlist exported', body: 'Saved as an .m3u8 file.' })
  }
  const withArt = songs.filter((s) => s.coverPath)
  const covers = songs.slice(0, 4)
  const total = songs.reduce((a, s) => a + s.duration, 0)

  return (
    <div className="pb-28">
      <div className="relative isolate flex items-end gap-7 overflow-hidden px-8 pt-16 pb-8">
        {/* The playlist's own covers, blurred, so the header takes their colors */}
        <div aria-hidden className="absolute -inset-16 -z-10 grid grid-cols-2 opacity-70 blur-[60px] saturate-150">
          {(withArt.length ? withArt : [null]).slice(0, 4).map((c, i, arr) =>
            c ? (
              <img key={c.id} src={mediaUrl(c.coverPath!, c.updatedAt)} alt="" className={cx('size-full object-cover', arr.length === 1 && 'col-span-2 row-span-2', arr.length === 3 && i === 2 && 'col-span-2')} />
            ) : (
              <div key="none" className="col-span-2 row-span-2 bg-gradient-to-br from-ember-500/50 to-gold-400/20" />
            )
          )}
        </div>
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-ink-900/10 via-ink-900/45 to-ink-900" />
        <div className="grid size-48 shrink-0 grid-cols-2 overflow-hidden rounded-xl bg-ink-800 shadow-[0_20px_50px_-12px_rgb(0_0_0/0.7)]">
          {covers.length >= 4 ? (
            covers.map((s) => <Cover key={s.id} path={s.coverPath} seed={s.id} size={96} bust={s.updatedAt} className="!rounded-none" />)
          ) : covers[0] ? (
            <Cover path={covers[0].coverPath} seed={covers[0].id} size={192} bust={covers[0].updatedAt} className="col-span-2 row-span-2 !rounded-none" />
          ) : (
            <div className="col-span-2 row-span-2 flex items-center justify-center text-ink-400">
              <ListMusic size={56} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-100/70">Playlist</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="no-drag mt-2 w-full rounded-lg bg-transparent text-5xl font-bold tracking-tight outline-none hover:bg-white/5 focus:bg-white/5"
            aria-label="Playlist name"
          />
          <p className="mt-3 text-sm text-ink-100/75">
            {songs.length} song{songs.length === 1 ? '' : 's'}
            {total > 0 && ` · ${fmtDuration(total)}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 px-8 py-5">
        <button
          onClick={() => playSongs(songs, 0)}
          disabled={!songs.length}
          aria-label="Play playlist"
          className="flex size-14 items-center justify-center rounded-full forge-gradient text-on-accent shadow-xl transition hover:scale-105 disabled:opacity-40"
        >
          <Play size={24} fill="currentColor" className="ml-1" />
        </button>
        <IconButton
          label="Shuffle play"
          size="lg"
          disabled={!songs.length}
          onClick={() => {
            const p = usePlayer.getState()
            if (!p.shuffle) p.toggleShuffle()
            playSongs(songs, Math.floor(Math.random() * songs.length))
          }}
        >
          <Shuffle size={20} />
        </IconButton>
        <Button
          variant="ghost"
          onClick={() => useApp.getState().openSheet({ kind: 'pack', songIds: songs.map((s) => s.id), name: pl.name })}
          disabled={!songs.length}
          icon={<Package size={15} />}
          title="Send this playlist to a friend as one file"
        >
          Share pack
        </Button>
        <Button
          variant="ghost"
          onClick={() => useApp.getState().openSheet({ kind: 'medley', songIds: songs.map((s) => s.id) })}
          disabled={songs.length < 2}
          icon={<Combine size={15} />}
        >
          Medley
        </Button>
        <PlaylistMenu onExport={exportM3U} onDelete={del} canExport={songs.length > 0} />
      </div>

      <div className="px-8">
        {songs.length ? (
          <SongTable songs={songs} playlistId={pl.id} />
        ) : (
          <EmptyState
            compact
            title={`Nothing in “${pl.name}” yet`}
            body="Add songs below, or tick songs in your library and choose Playlist."
            actions={
              library.songs.length > 0 && (
                <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => document.getElementById('add-songs')?.scrollIntoView({ behavior: 'smooth' })}>
                  Add songs
                </Button>
              )
            }
          />
        )}

        <section id="add-songs" className="mt-12 scroll-mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Add songs</h2>
            <div className="relative w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search your library"
                className="h-9 w-full rounded-full border border-ink-600 bg-ink-850 pl-9 pr-3 text-sm outline-none focus:border-ember-500/60"
              />
            </div>
          </div>
          {candidates.length ? (
            <div className="flex flex-col">
              {candidates.map((s) => (
                <div key={s.id} className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-ink-800">
                  <Cover path={s.coverPath} seed={s.id} size={40} bust={s.updatedAt} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.title}</div>
                    <div className="truncate text-xs text-ink-400">{s.artist}</div>
                  </div>
                  <span className="font-mono text-xs text-ink-400">{fmtTime(s.duration)}</span>
                  <Button size="sm" onClick={() => add(s.id)} icon={<Plus size={14} />}>
                    Add
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-400">{library.songs.length ? 'Every song is already in this playlist.' : 'Forge some songs first.'}</p>
          )}
        </section>
      </div>
    </div>
  )
}

function PlaylistMenu({ onExport, onDelete, canExport }: { onExport: () => void; onDelete: () => void; canExport: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])
  const item = 'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-ink-200 hover:bg-ink-600/60 hover:text-ink-100 disabled:opacity-40'
  return (
    <div ref={ref} className="relative">
      <IconButton label="More playlist actions" size="lg" onClick={() => setOpen(!open)}>
        <MoreHorizontal size={20} />
      </IconButton>
      {open && (
        <div role="menu" className="absolute left-0 top-12 z-30 w-56 rounded-xl border border-ink-600 bg-ink-800 p-1.5 shadow-2xl">
          <button className={item} disabled={!canExport} onClick={() => (setOpen(false), onExport())}>
            <Download size={15} /> Export as .m3u8
          </button>
          <div className="my-1 h-px bg-ink-600" />
          <button className={cx(item, '!text-red-400')} onClick={() => (setOpen(false), onDelete())}>
            <Trash2 size={15} /> Delete playlist
          </button>
        </div>
      )}
    </div>
  )
}
