import { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import type { Song } from '@shared/types'
import { useApp } from '@/lib/store'
import { fmtTime } from '@/lib/format'
import { Cover, cx } from './ui'

/** Searchable list of library songs with checkboxes. Selection keeps the order songs were ticked. */
export function SongChecklist({ selected, onChange, height = 300 }: { selected: string[]; onChange: (ids: string[]) => void; height?: number }) {
  const songs = useApp((s) => s.library.songs)
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? songs.filter((s) => `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(n)) : songs
  }, [songs, q])
  const sel = new Set(selected)
  const toggle = (s: Song) => onChange(sel.has(s.id) ? selected.filter((id) => id !== s.id) : [...selected, s.id])
  const allShown = shown.length > 0 && shown.every((s) => sel.has(s.id))

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your library"
            className="h-9 w-full rounded-full border border-ink-600 bg-ink-800 pl-9 pr-3 text-sm outline-none focus:border-ember-500/60"
          />
        </div>
        <button
          onClick={() => onChange(allShown ? selected.filter((id) => !shown.some((s) => s.id === id)) : [...selected, ...shown.filter((s) => !sel.has(s.id)).map((s) => s.id)])}
          className="shrink-0 text-xs font-medium text-ink-300 hover:text-ink-100"
        >
          {allShown ? 'Clear' : q.trim() ? 'Select these' : 'Select all'}
        </button>
      </div>
      <div className="overflow-y-auto rounded-xl border border-ink-700 bg-ink-900/50 p-1" style={{ height }}>
        {shown.map((s) => {
          const on = sel.has(s.id)
          return (
            <button
              key={s.id}
              onClick={() => toggle(s)}
              aria-pressed={on}
              className={cx('flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition', on ? 'bg-ember-500/10' : 'hover:bg-ink-800')}
            >
              <span className={cx('flex size-5 shrink-0 items-center justify-center rounded-md border', on ? 'border-ember-500 bg-ember-500 text-on-accent' : 'border-ink-500')}>
                {on && <Check size={13} strokeWidth={3} />}
              </span>
              <Cover path={s.coverPath} seed={s.id} size={34} bust={s.updatedAt} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{s.title}</span>
                <span className="block truncate text-xs text-ink-400">{s.artist || 'Unknown artist'}</span>
              </span>
              <span className="shrink-0 font-mono text-[11px] text-ink-400">{fmtTime(s.duration)}</span>
            </button>
          )
        })}
        {!shown.length && <p className="py-10 text-center text-sm text-ink-400">{songs.length ? `Nothing matches “${q}”.` : 'Your library is empty.'}</p>}
      </div>
    </div>
  )
}
