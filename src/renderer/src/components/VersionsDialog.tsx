import { Layers, Pause, Play, Unlink } from 'lucide-react'
import type { Song } from '@shared/types'
import { versionTags } from '@shared/versions'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { usePlayer } from '@/lib/player'
import { useVersionGroups, versionsOf } from '@/lib/versions'
import { fmtTime, timeAgo } from '@/lib/format'
import { Cover, EqIcon, IconButton, Modal, cx } from './ui'

/** Play a version, or switch to it at the same spot if another version is already playing. */
export function playVersion(song: Song, all: Song[]) {
  const p = usePlayer.getState()
  const cur = p.current()
  if (cur && all.some((v) => v.id === cur.id) && cur.id !== song.id) p.switchVersion(song)
  else if (cur?.id === song.id) p.toggle()
  else p.playSongs(all, all.indexOf(song))
}

export function VersionTag({ label }: { label: string }) {
  return <span className="rounded bg-ink-700 px-1.5 py-0.5 text-[10px] font-semibold text-ink-300">{label}</span>
}

export function VersionsDialog() {
  const song = useApp((s) => s.versionsOf)
  const close = () => useApp.getState().showVersions(null)
  const groups = useVersionGroups()
  const current = usePlayer((s) => s.current())
  const playing = usePlayer((s) => s.playing)
  if (!song) return null
  const all = versionsOf(groups, song)

  const separate = async (s: Song) => {
    // Give it a group of its own so it stops stacking with the others
    await api.song.patch(s.id, { versionGroup: `solo-${s.id}` })
    await useApp.getState().refresh()
    if (all.length <= 2) close()
  }

  return (
    <Modal open onClose={close} title={`Versions of “${song.title}”`} width="max-w-xl">
      <p className="mb-4 flex items-start gap-2 text-sm leading-relaxed text-ink-400">
        <Layers size={16} className="mt-0.5 shrink-0 text-ember-400" />
        Songs with the same title stack together. Play one, then click another to switch at the same spot and compare.
      </p>
      <div className="flex flex-col gap-1.5">
        {all.map((v) => {
          const isCur = current?.id === v.id
          return (
            <div key={v.id} className={cx('group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition', isCur ? 'border-ember-500/50 bg-ember-500/5' : 'border-ink-700 hover:bg-ink-800')}>
              <button onClick={() => playVersion(v, all)} className="relative shrink-0" aria-label={`Play ${v.title} by ${v.artist}`}>
                <Cover path={v.coverPath} seed={v.id} size={48} bust={v.updatedAt} />
                <span className={cx('absolute inset-0 flex items-center justify-center rounded-md bg-black/50 text-white transition', isCur ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                  {isCur && playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <div className={cx('flex items-center gap-2 truncate text-sm font-medium', isCur && 'text-ember-400')}>
                  {isCur && playing && <EqIcon />}
                  <span className="truncate">{v.title}</span>
                </div>
                <div className="truncate text-xs text-ink-400">
                  {v.artist || 'Unknown artist'} · {fmtTime(v.duration)} · {timeAgo(v.createdAt)}
                </div>
                {versionTags(v).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {versionTags(v).map((t) => (
                      <VersionTag key={t} label={t} />
                    ))}
                  </div>
                )}
              </div>
              <IconButton label="Not a version of this song" size="sm" className="opacity-0 group-hover:opacity-100" onClick={() => separate(v)}>
                <Unlink size={14} />
              </IconButton>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
