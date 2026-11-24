import { useEffect, useRef, useState } from 'react'
import { Combine, ListEnd, ListMinus, ListPlus, Package, Play, Trash2, X } from 'lucide-react'
import type { Song } from '@shared/types'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { usePlayer } from '@/lib/player'
import { useSelection } from '@/lib/selection'
import { cx } from './ui'

/** Floating pill above the player with actions for the ticked songs. */
export function SelectionBar() {
  const ids = useSelection((s) => s.ids)
  const scope = useSelection((s) => s.scope)
  const clear = useSelection((s) => s.clear)
  const library = useApp((s) => s.library)
  const route = useApp((s) => s.route)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const onPage = (route.name === 'library' && scope === 'library') || (route.name === 'playlist' && scope === route.id)
  const show = onPage && ids.length > 0
  const playlist = scope && scope !== 'library' ? library.playlists.find((p) => p.id === scope) : undefined

  // Ticked songs in the order the list shows them
  const order = playlist ? playlist.songIds : library.songs.map((s) => s.id)
  const songs = order.filter((id) => ids.includes(id)).map((id) => library.songs.find((s) => s.id === id)).filter((s): s is Song => !!s)

  useEffect(() => {
    if (!show) return
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]')) return
      if (menu) setMenu(false)
      else clear()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [show, menu, clear])

  useEffect(() => {
    if (!menu) return
    const h = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false)
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [menu])

  if (!show) return null
  const n = songs.length
  const { toast, refresh, openSheet } = useApp.getState()
  const label = `${n} song${n === 1 ? '' : 's'}`

  const addTo = async (pid: string) => {
    const pl = library.playlists.find((p) => p.id === pid)
    if (!pl) return
    const add = songs.map((s) => s.id).filter((id) => !pl.songIds.includes(id))
    if (add.length) await api.playlist.update(pid, { songIds: [...pl.songIds, ...add] })
    await refresh()
    setMenu(false)
    toast({ kind: 'success', title: add.length ? `Added ${add.length} to ${pl.name}` : `Already in ${pl.name}` })
  }
  const newPlaylist = async () => {
    const id = await api.playlist.create(`New Playlist ${library.playlists.length + 1}`, songs.map((s) => s.id))
    await refresh()
    setMenu(false)
    clear()
    useApp.getState().navigate({ name: 'playlist', id })
  }
  const removeFromPlaylist = async () => {
    if (!playlist) return
    await api.playlist.update(playlist.id, { songIds: playlist.songIds.filter((id) => !ids.includes(id)) })
    await refresh()
    clear()
    toast({ kind: 'success', title: `Removed ${label} from ${playlist.name}` })
  }
  const remove = async () => {
    if (!confirm(`Delete ${label}? The MP3s are removed from your Spotify folder too.`)) return
    let lib = library
    for (const s of songs) {
      lib = await api.song.delete(s.id, true)
      usePlayer.getState().removeSong(s.id)
    }
    useApp.getState().setLibrary(lib)
    clear()
    toast({ kind: 'success', title: `Deleted ${label}` })
  }

  const btn = 'flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-ink-200 transition hover:bg-ink-700 hover:text-ink-100 disabled:pointer-events-none disabled:opacity-40'
  const item = 'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-ink-200 hover:bg-ink-600/60 hover:text-ink-100'

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-4">
      <div
        role="toolbar"
        aria-label="Ticked songs"
        className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-visible rounded-full border border-ink-600 bg-ink-800/95 py-1.5 pl-4 pr-1.5 shadow-[0_12px_40px_rgb(0_0_0/0.55)] ring-1 ring-ember-500/25 backdrop-blur animate-[sf-pop_.18s_ease-out]"
      >
        <span className="mr-2 whitespace-nowrap text-[13px] font-bold text-ember-400">{n} selected</span>
        <button className="flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold forge-gradient text-on-accent shadow-accent hover:brightness-110" onClick={() => usePlayer.getState().playSongs(songs, 0)}>
          <Play size={14} fill="currentColor" /> Play
        </button>
        <button className={btn} onClick={() => (songs.forEach((s) => usePlayer.getState().enqueue(s)), toast({ kind: 'success', title: `Queued ${label}` }))} title="Add to the end of the queue">
          <ListEnd size={15} />
          <span className="max-lg:hidden">Queue</span>
        </button>
        <div ref={menuRef} className="relative">
          <button className={cx(btn, menu && 'bg-ink-700')} onClick={() => setMenu(!menu)} aria-expanded={menu}>
            <ListPlus size={15} /> Playlist
          </button>
          {menu && (
            <div role="menu" className="absolute bottom-11 left-0 z-40 max-h-72 w-56 overflow-y-auto rounded-xl border border-ink-600 bg-ink-800 p-1.5 shadow-2xl">
              <button className={item} onClick={newPlaylist}>
                + New playlist with these
              </button>
              {library.playlists
                .filter((p) => p.id !== playlist?.id)
                .map((p) => (
                  <button key={p.id} className={item} onClick={() => addTo(p.id)}>
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
        <button className={btn} disabled={n < 2} onClick={() => openSheet({ kind: 'medley', songIds: songs.map((s) => s.id) })} title={n < 2 ? 'Tick at least 2 songs' : 'Join them into one track'}>
          <Combine size={15} />
          <span className="max-lg:hidden">Medley</span>
        </button>
        <button className={btn} onClick={() => openSheet({ kind: 'pack', songIds: songs.map((s) => s.id), name: playlist?.name ?? (n === 1 ? songs[0].title : 'My songs') })} title="Send them to a friend as one file">
          <Package size={15} />
          <span className="max-lg:hidden">Share</span>
        </button>
        {playlist && (
          <button className={btn} onClick={removeFromPlaylist} title="Take them out of this playlist (they stay in your library)">
            <ListMinus size={15} />
            <span className="max-lg:hidden">Remove</span>
          </button>
        )}
        <button className={cx(btn, '!text-red-400 hover:!bg-red-500/10')} onClick={remove} title="Delete these songs and their MP3s">
          <Trash2 size={15} />
          <span className="max-lg:hidden">Delete</span>
        </button>
        <span className="mx-1 h-5 w-px bg-ink-600" />
        <button className="flex size-8 items-center justify-center rounded-full text-ink-300 hover:bg-ink-700 hover:text-ink-100" onClick={clear} aria-label="Clear selection" title="Clear (Esc)">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
