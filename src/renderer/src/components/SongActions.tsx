import { useEffect, useRef, useState } from 'react'
import { ExternalLink, FolderOpen, ListPlus, MoreHorizontal, Pencil, Scissors, Trash2, ListMinus, ListEnd, Layers, Package } from 'lucide-react'
import type { Song } from '@shared/types'
import { siteName } from '@shared/sites'
import { useVersionGroups, versionsOf } from '@/lib/versions'
import { api, newJobId } from '@/lib/api'
import { useApp } from '@/lib/store'
import { usePlayer } from '@/lib/player'
import { IconButton, cx } from './ui'

export async function reclip(song: Song) {
  const { toast, navigate } = useApp.getState()
  toast({ kind: 'info', title: 'Opening source…', body: song.sourceTitle })
  try {
    const source = await api.source.prepare(newJobId(), song.sourceUrl)
    navigate({ name: 'editor', source: { ...source, startHint: null }, editSong: song })
  } catch (e) {
    toast({ kind: 'error', title: "Couldn't open the source video", body: String((e as Error).message) })
  }
}

export async function removeSong(song: Song) {
  if (!confirm(`Delete "${song.title}"? The MP3 is removed from your Spotify folder too.`)) return
  const lib = await api.song.delete(song.id, true)
  usePlayer.getState().removeSong(song.id)
  useApp.getState().setLibrary(lib)
  useApp.getState().toast({ kind: 'success', title: 'Song deleted' })
}

export function SongActions({ song, playlistId, className }: { song: Song; playlistId?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [sub, setSub] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const library = useApp((s) => s.library)
  const refresh = useApp((s) => s.refresh)
  const editSong = useApp((s) => s.editSong)
  const toast = useApp((s) => s.toast)
  const enqueue = usePlayer((s) => s.enqueue)
  const groups = useVersionGroups()
  const versionCount = versionsOf(groups, song).length
  const site = song.sourceUrl.startsWith('file:') ? null : siteName(song.sourceUrl) ?? 'source page'

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])

  const addTo = async (pid: string) => {
    const pl = library.playlists.find((p) => p.id === pid)
    if (!pl) return
    if (!pl.songIds.includes(song.id)) await api.playlist.update(pid, { songIds: [...pl.songIds, song.id] })
    await refresh()
    toast({ kind: 'success', title: `Added to ${pl.name}` })
    setOpen(false)
  }
  const newPlaylist = async () => {
    const name = `New Playlist ${library.playlists.length + 1}`
    const id = await api.playlist.create(name, [song.id])
    await refresh()
    setOpen(false)
    useApp.getState().navigate({ name: 'playlist', id })
  }
  const removeFromPlaylist = async () => {
    const pl = library.playlists.find((p) => p.id === playlistId)
    if (!pl) return
    await api.playlist.update(pl.id, { songIds: pl.songIds.filter((id) => id !== song.id) })
    await refresh()
    setOpen(false)
  }

  const item = 'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-ink-200 hover:bg-ink-600/60 hover:text-ink-100'

  return (
    <div ref={ref} className={cx('relative', className)} onClick={(e) => e.stopPropagation()}>
      <IconButton label="More actions" size="sm" onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal size={16} />
      </IconButton>
      {open && (
        <div className="absolute right-0 top-8 z-30 w-60 rounded-xl border border-ink-600 bg-ink-800 p-1.5 shadow-2xl">
          <button className={item} onClick={() => (enqueue(song), setOpen(false))}>
            <ListEnd size={15} /> Add to queue
          </button>
          <div className="relative" onMouseEnter={() => setSub(true)} onMouseLeave={() => setSub(false)}>
            <button className={item}>
              <ListPlus size={15} /> Add to playlist
            </button>
            {sub && (
              <div className="absolute right-full top-0 mr-1 w-48 rounded-xl border border-ink-600 bg-ink-800 p-1.5 shadow-2xl">
                <button className={item} onClick={newPlaylist}>
                  + New playlist
                </button>
                {library.playlists.map((p) => (
                  <button key={p.id} className={item} onClick={() => addTo(p.id)}>
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {playlistId && (
            <button className={item} onClick={removeFromPlaylist}>
              <ListMinus size={15} /> Remove from playlist
            </button>
          )}
          <div className="my-1 h-px bg-ink-600" />
          <button className={item} onClick={() => (editSong(song), setOpen(false))}>
            <Pencil size={15} /> Edit details, lyrics & cover
          </button>
          {versionCount > 1 && (
            <button className={item} onClick={() => (useApp.getState().showVersions(song), setOpen(false))}>
              <Layers size={15} /> Versions ({versionCount})
            </button>
          )}
          <button className={item} onClick={() => (reclip(song), setOpen(false))}>
            <Scissors size={15} /> Re-clip
          </button>
          <button className={item} onClick={() => (api.song.reveal(song.filePath), setOpen(false))}>
            <FolderOpen size={15} /> Show in folder
          </button>
          <button
            className={item}
            onClick={() => {
              const ids = versionCount > 1 ? versionsOf(groups, song).map((s) => s.id) : [song.id]
              useApp.getState().openSheet({ kind: 'pack', songIds: ids, name: song.title })
              setOpen(false)
            }}
          >
            <Package size={15} /> Share with a friend
          </button>
          {site && (
            <button className={item} onClick={() => (api.shell.openExternal(song.sourceUrl), setOpen(false))}>
              <ExternalLink size={15} /> Open on {site}
            </button>
          )}
          <div className="my-1 h-px bg-ink-600" />
          <button className={cx(item, '!text-red-400')} onClick={() => (setOpen(false), removeSong(song))}>
            <Trash2 size={15} /> Delete
          </button>
        </div>
      )}
    </div>
  )
}
