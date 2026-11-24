import { useEffect, useState } from 'react'
import { AlertCircle, Loader2, ScanSearch, Search } from 'lucide-react'
import type { TagMatch } from '@shared/types'
import { api } from '@/lib/api'
import { cleanError } from '@/lib/queue'
import { fmtTime } from '@/lib/format'
import { Button, Input, Modal, Toggle } from './ui'

export interface TagPick {
  match: TagMatch
  /** Downloaded artwork on disk, when "use the cover" was on */
  coverPath: string | null
}

/**
 * "Look up" button: finds album, year, genre and the official cover in the iTunes catalog.
 * Only the title and artist are sent.
 */
export function TagLookupButton({
  title,
  artist,
  duration,
  onPick,
  size = 'sm'
}: {
  title: string
  artist: string
  duration?: number
  onPick: (p: TagPick) => void
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size={size} variant="ghost" icon={<ScanSearch size={14} />} onClick={() => setOpen(true)} disabled={!title.trim()} title="Find the album, year, genre and official cover">
        Look up
      </Button>
      {open && <TagLookupDialog title={title} artist={artist} duration={duration} onClose={() => setOpen(false)} onPick={onPick} />}
    </>
  )
}

function TagLookupDialog({
  title,
  artist,
  duration,
  onClose,
  onPick
}: {
  title: string
  artist: string
  duration?: number
  onClose: () => void
  onPick: (p: TagPick) => void
}) {
  const [q, setQ] = useState({ title, artist })
  const [results, setResults] = useState<TagMatch[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [useCover, setUseCover] = useState(true)
  const [applying, setApplying] = useState<number | null>(null)

  const search = async (t = q.title, a = q.artist) => {
    setLoading(true)
    setError('')
    try {
      setResults(await api.tags.lookup(t, a, duration))
    } catch (e) {
      setError(cleanError(e))
    }
    setLoading(false)
  }
  useEffect(() => {
    search(title, artist)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = async (m: TagMatch) => {
    setApplying(m.id)
    let coverPath: string | null = null
    if (useCover && m.artwork) {
      try {
        coverPath = await api.tags.artwork(m.artwork)
      } catch {
        coverPath = null
      }
    }
    onPick({ match: m, coverPath })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Look up song info" width="max-w-xl">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          search()
        }}
      >
        <Input value={q.title} onChange={(e) => setQ({ ...q, title: e.target.value })} placeholder="Title" aria-label="Title" />
        <Input value={q.artist} onChange={(e) => setQ({ ...q, artist: e.target.value })} placeholder="Artist" aria-label="Artist" className="max-w-44" />
        <Button type="submit" icon={loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} disabled={loading || !q.title.trim()}>
          Search
        </Button>
      </form>
      <label className="mt-3 flex items-center gap-3 text-sm text-ink-300">
        <Toggle checked={useCover} onChange={setUseCover} label="Use the album cover" />
        Also use the album cover
      </label>
      <div className="mt-4 flex max-h-[50vh] flex-col overflow-y-auto">
        {loading && !results && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-400">
            <Loader2 size={16} className="animate-spin" /> Searching…
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle size={15} /> {error}
          </div>
        )}
        {results?.length === 0 && <p className="py-10 text-center text-sm text-ink-400">No matches. Try a shorter title, or check the artist's spelling.</p>}
        {results?.map((m) => (
          <button
            key={m.id}
            onClick={() => pick(m)}
            disabled={applying != null}
            className="flex items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-ink-800 disabled:opacity-60"
          >
            {m.thumb ? <img src={m.thumb} alt="" className="size-12 shrink-0 rounded-md object-cover" /> : <span className="size-12 shrink-0 rounded-md bg-ink-700" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{m.title}</span>
              <span className="block truncate text-xs text-ink-400">
                {m.artist}
                {m.album && ` · ${m.album}`}
              </span>
              <span className="block truncate text-[11px] text-ink-500">{[m.year, m.genre, m.duration ? fmtTime(m.duration) : ''].filter(Boolean).join(' · ')}</span>
            </span>
            {applying === m.id ? <Loader2 size={15} className="animate-spin text-ember-400" /> : <span className="text-xs font-medium text-ember-400">Use</span>}
          </button>
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-ink-500">From the iTunes catalog. Only the title and artist are sent. Your title and artist are kept; album, year and genre are filled in.</p>
    </Modal>
  )
}
