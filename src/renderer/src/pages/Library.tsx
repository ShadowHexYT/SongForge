import { useMemo, useState } from 'react'
import { LayoutGrid, List, Play, Search, Shuffle, Music2, Upload, Layers, Package, Combine, CopyX } from 'lucide-react'
import { findDuplicates } from '@shared/duplicates'
import { versionKey } from '@shared/versions'
import { SmithHammer } from '@/components/ForgeIcons'
import { useApp } from '@/lib/store'
import { usePlayer } from '@/lib/player'
import { useVersionGroups } from '@/lib/versions'
import { fmtDuration } from '@/lib/format'
import { Button, Segmented, cx } from '@/components/ui'
import { SongGrid, SongTable } from '@/components/SongList'

type Sort = 'recent' | 'title' | 'artist'

function useViewPref(): [string, (v: string) => void] {
  const [v, setV] = useState(() => {
    try {
      return localStorage.getItem('sf-lib-view') ?? 'list'
    } catch {
      return 'list'
    }
  })
  return [
    v,
    (n) => {
      setV(n)
      try {
        localStorage.setItem('sf-lib-view', n)
      } catch {
        /* ignore */
      }
    }
  ]
}

export function LibraryPage() {
  const songs = useApp((s) => s.library.songs)
  const navigate = useApp((s) => s.navigate)
  const playSongs = usePlayer((s) => s.playSongs)
  const [q, setQ] = useState('')
  const [artist, setArtist] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('recent')
  const [view, setView] = useViewPref()
  const [stack, setStack] = useState(() => {
    try {
      return localStorage.getItem('sf-lib-stack') === '1'
    } catch {
      return false
    }
  })
  const groups = useVersionGroups()
  const setImportOpen = useApp((s) => s.setImportOpen)
  const openSheet = useApp((s) => s.openSheet)
  const dupeCount = useMemo(() => findDuplicates(songs).length, [songs])

  const artists = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of songs) if (s.artist) m.set(s.artist, (m.get(s.artist) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [songs])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let out = songs.filter(
      (s) => (!artist || s.artist === artist) && (!needle || [s.title, s.artist, s.album, s.genre, s.sourceTitle].some((f) => f?.toLowerCase().includes(needle)))
    )
    if (stack) {
      // One row per song: keep the newest version of each stack
      const seen = new Set<string>()
      out = out.filter((s) => {
        const k = versionKey(s)
        if (!groups.has(k)) return true
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    }
    if (sort === 'title') out = [...out].sort((a, b) => a.title.localeCompare(b.title))
    if (sort === 'artist') out = [...out].sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title))
    return out
  }, [songs, q, artist, sort, stack, groups])

  const total = filtered.reduce((a, s) => a + s.duration, 0)

  if (!songs.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-ink-800 text-ink-400">
          <Music2 size={28} />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Your library is empty</h2>
          <p className="mt-1 text-sm text-ink-400">Songs you forge show up here and in your Spotify folder.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => navigate({ name: 'forge' })} icon={<SmithHammer size={17} />}>
            Forge your first song
          </Button>
          <Button data-tour="library-import" onClick={() => setImportOpen(true)} icon={<Upload size={15} />}>
            Import songs
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1600px] px-6 pt-14 pb-10 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-400">Library</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">Your songs</h1>
          <p className="mt-2 text-sm text-ink-400">
            {filtered.length} song{filtered.length === 1 ? '' : 's'} · {fmtDuration(total)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" variant="ghost" data-tour="library-import" onClick={() => setImportOpen(true)} icon={<Upload size={16} />} title="Add MP3s and other songs you already have">
            Import
          </Button>
          <Button variant="primary" size="lg" onClick={() => playSongs(filtered, 0)} icon={<Play size={18} fill="currentColor" />}>
            Play
          </Button>
          <Button
            size="lg"
            onClick={() => {
              const p = usePlayer.getState()
              if (!p.shuffle) p.toggleShuffle()
              playSongs(filtered, Math.floor(Math.random() * filtered.length))
            }}
            icon={<Shuffle size={16} />}
          >
            Shuffle
          </Button>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="relative w-full min-w-48 max-w-72 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search songs, artists, albums"
            className="h-9 w-full rounded-full border border-ink-600 bg-ink-850 pl-9 pr-3 text-sm outline-none focus:border-ember-500/60"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="h-9 rounded-full border border-ink-600 bg-ink-850 px-3 text-sm text-ink-200 outline-none"
          aria-label="Sort"
        >
          <option value="recent">Recently added</option>
          <option value="title">Title</option>
          <option value="artist">Artist</option>
        </select>
        {groups.size > 0 && (
          <button
            onClick={() => {
              setStack(!stack)
              try {
                localStorage.setItem('sf-lib-stack', stack ? '0' : '1')
              } catch {
                /* ignore */
              }
            }}
            aria-pressed={stack}
            title="Show one row per song, with its other versions behind the stack badge"
            className={cx(
              'flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition',
              stack ? 'border-ember-500/50 bg-ember-500/10 text-ember-400' : 'border-ink-600 text-ink-300 hover:text-ink-100'
            )}
          >
            <Layers size={14} /> Stack versions
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={<Combine size={15} />}
            title="Join songs into one track with crossfades"
            onClick={() => openSheet({ kind: 'medley', songIds: [] })}
          >
            <span className="max-xl:hidden">Medley</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Package size={15} />}
            title="Send songs to a friend as one file"
            onClick={() => openSheet({ kind: 'pack', songIds: filtered.length < songs.length ? filtered.map((s) => s.id) : [], name: artist ?? 'My songs' })}
          >
            <span className="max-xl:hidden">Share</span>
          </Button>
          <Button variant="ghost" size="sm" icon={<CopyX size={15} />} title="Find songs that are in your library twice" onClick={() => openSheet({ kind: 'dupes' })}>
            <span className="max-xl:hidden">Duplicates</span>
            {dupeCount > 0 && <span className="rounded-full bg-ember-500/20 px-1.5 text-[11px] font-bold text-ember-400">{dupeCount}</span>}
          </Button>
          <span className="mx-1 h-5 w-px bg-ink-700" />
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: 'List', icon: <List size={13} /> },
              { value: 'grid', label: 'Grid', icon: <LayoutGrid size={13} /> }
            ]}
          />
        </div>
      </div>

      {artists.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip active={!artist} onClick={() => setArtist(null)}>
            All
          </Chip>
          {artists.map(([a, n]) => (
            <Chip key={a} active={artist === a} onClick={() => setArtist(artist === a ? null : a)}>
              {a} <span className="opacity-60">{n}</span>
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-6">
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-400">No songs match "{q}"</p>
        ) : view === 'grid' ? (
          <SongGrid songs={filtered} />
        ) : (
          <SongTable songs={filtered} />
        )}
      </div>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition',
        active ? 'bg-ink-100 text-ink-950' : 'bg-ink-800 text-ink-200 hover:bg-ink-700'
      )}
    >
      {children}
    </button>
  )
}
