import { useMemo, useState } from 'react'
import { CheckCircle2, CopyX, Loader2, Play } from 'lucide-react'
import type { Song } from '@shared/types'
import { findDuplicates, pickKeeper } from '@shared/duplicates'
import { versionTags } from '@shared/versions'
import { siteName } from '@shared/sites'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { usePlayer } from '@/lib/player'
import { cleanError } from '@/lib/queue'
import { fmtTime, timeAgo } from '@/lib/format'
import { Button, Cover, IconButton, Modal, cx } from './ui'

/** Find songs that are in the library twice and keep one copy of each. */
export function DuplicatesDialog() {
  const close = () => useApp.getState().openSheet(null)
  const library = useApp((s) => s.library)
  const toast = useApp((s) => s.toast)
  const groups = useMemo(() => findDuplicates(library.songs), [library.songs])
  const inPlaylists = (id: string) => library.playlists.filter((p) => p.songIds.includes(id)).length
  // Which copy to keep in each group (keyed by the group's first song id)
  const [keep, setKeep] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const keeperOf = (g: Song[]) => keep[g[0].id] ?? pickKeeper(g, inPlaylists).id

  const merge = async (g: Song[]) => {
    const k = keeperOf(g)
    const lib = await api.song.merge(
      k,
      g.filter((s) => s.id !== k).map((s) => s.id)
    )
    for (const s of g) if (s.id !== k) usePlayer.getState().removeSong(s.id)
    useApp.getState().setLibrary(lib)
  }

  const one = async (g: Song[]) => {
    setBusy(g[0].id)
    try {
      await merge(g)
    } catch (e) {
      toast({ kind: 'error', title: "Couldn't remove the copies", body: cleanError(e) })
    }
    setBusy(null)
  }
  const all = async () => {
    const extras = groups.reduce((a, g) => a + g.length - 1, 0)
    if (!confirm(`Remove ${extras} extra cop${extras === 1 ? 'y' : 'ies'}? Their MP3 files are deleted too. Playlists keep the copy you chose.`)) return
    setBusy('all')
    try {
      for (const g of groups) await merge(g)
      toast({ kind: 'success', title: 'Duplicates removed', body: `${extras} extra cop${extras === 1 ? 'y' : 'ies'} deleted.` })
    } catch (e) {
      toast({ kind: 'error', title: "Couldn't remove every copy", body: cleanError(e) })
    }
    setBusy(null)
  }

  const where = (s: Song) =>
    s.fromPack ? `From the pack “${s.fromPack}”` : s.imported ? 'Imported' : s.sourceUrl.startsWith('file:') ? 'From a file' : `From ${siteName(s.sourceUrl) ?? 'the web'}`

  return (
    <Modal open onClose={() => !busy && close()} title="Find duplicates" width="max-w-3xl">
      {groups.length === 0 ? (
        <div className="py-10 text-center">
          <CheckCircle2 size={36} className="mx-auto text-emerald-400" />
          <div className="mt-3 text-lg font-semibold">No duplicates</div>
          <p className="mt-1 text-sm text-ink-400">Every song in your library is there once. Different versions (live, sped up, instrumental…) don't count as duplicates.</p>
          <Button className="mt-6" variant="primary" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-400">
              {groups.length} song{groups.length === 1 ? ' is' : 's are'} in your library more than once. Choose the copy to keep. Playlists switch to that copy, and the other MP3s are deleted.
            </p>
            <Button variant="primary" onClick={all} disabled={!!busy} icon={busy === 'all' ? <Loader2 size={15} className="animate-spin" /> : <CopyX size={15} />}>
              Clean up all
            </Button>
          </div>
          <div className="mt-5 flex flex-col gap-4">
            {groups.map((g) => {
              const k = keeperOf(g)
              return (
                <div key={g[0].id} className="rounded-xl border border-ink-700 bg-ink-900/40">
                  <div className="flex items-center gap-3 border-b border-ink-700 px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {g[0].title} <span className="font-normal text-ink-400">· {g[0].artist || 'Unknown artist'}</span>
                    </span>
                    <span className="text-xs text-ink-400">{g.length} copies</span>
                    <Button size="sm" onClick={() => one(g)} disabled={!!busy} icon={busy === g[0].id ? <Loader2 size={13} className="animate-spin" /> : undefined}>
                      Keep one
                    </Button>
                  </div>
                  {g.map((s) => {
                    const on = s.id === k
                    const pl = inPlaylists(s.id)
                    const tags = versionTags(s).filter((t) => t !== 'Imported' && t !== 'From a pack')
                    return (
                      <label key={s.id} className={cx('flex cursor-pointer items-center gap-3 px-4 py-2.5 transition', on ? 'bg-ember-500/5' : 'hover:bg-ink-800/60')}>
                        <input type="radio" name={g[0].id} checked={on} onChange={() => setKeep({ ...keep, [g[0].id]: s.id })} className="accent-[var(--color-ember-500)]" />
                        <Cover path={s.coverPath} seed={s.id} size={38} bust={s.updatedAt} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-[13px] font-medium">
                            <span className="truncate">{s.title}</span>
                            {on ? (
                              <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">KEEP</span>
                            ) : (
                              <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-400">REMOVE</span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-ink-400">
                            {where(s)} · added {timeAgo(s.createdAt)}
                            {pl > 0 && ` · in ${pl} playlist${pl === 1 ? '' : 's'}`}
                            {s.syncedLyrics ? ' · synced lyrics' : s.lyrics ? ' · lyrics' : ''}
                            {tags.length > 0 && ` · ${tags.join(', ')}`}
                          </span>
                        </span>
                        <span className="font-mono text-[11px] text-ink-400">{fmtTime(s.duration)}</span>
                        <IconButton label="Play this copy" size="sm" onClick={(e) => (e.preventDefault(), usePlayer.getState().playSongs([s], 0))}>
                          <Play size={14} />
                        </IconButton>
                      </label>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </>
      )}
    </Modal>
  )
}
