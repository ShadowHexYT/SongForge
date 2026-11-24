import { Play, Clock, Layers } from 'lucide-react'
import type { Song } from '@shared/types'
import { usePlayer } from '@/lib/player'
import { useApp } from '@/lib/store'
import { useVersionGroups, versionsOf } from '@/lib/versions'
import { fmtTime, timeAgo } from '@/lib/format'
import { Cover, EqIcon, cx } from './ui'
import { SongActions } from './SongActions'

/** "3 versions" pill that opens the Versions dialog. */
export function VersionBadge({ song, count }: { song: Song; count: number }) {
  if (count < 2) return null
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        useApp.getState().showVersions(song)
      }}
      title="See and compare all versions of this song"
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink-700 px-1.5 py-0.5 text-[10px] font-semibold text-ink-200 hover:bg-ember-500/20 hover:text-ember-400"
    >
      <Layers size={10} /> {count}
    </button>
  )
}

const COLS = 'grid-cols-[32px_minmax(0,1fr)_56px_36px] @[720px]:grid-cols-[40px_minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_72px_40px]'

export function SongTable({ songs, playlistId }: { songs: Song[]; playlistId?: string }) {
  const playSongs = usePlayer((s) => s.playSongs)
  const current = usePlayer((s) => s.current())
  const playing = usePlayer((s) => s.playing)
  const groups = useVersionGroups()

  return (
    <div className="@container text-sm">
      <div className={cx('grid items-center gap-3 border-b border-ink-700 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400 @[720px]:gap-4 @[720px]:px-4', COLS)}>
        <span className="text-right">#</span>
        <span>Title</span>
        <span className="hidden @[720px]:block">Album</span>
        <span className="hidden @[720px]:block">Added</span>
        <span className="flex justify-end">
          <Clock size={13} />
        </span>
        <span />
      </div>
      <div className="mt-2">
        {songs.map((s, i) => {
          const isCur = current?.id === s.id
          return (
            <div
              key={s.id}
              onDoubleClick={() => playSongs(songs, i)}
              className={cx('group grid items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-ink-800 @[720px]:gap-4 @[720px]:px-4', COLS, isCur && 'bg-ink-800/60')}
            >
              <span className="flex justify-end text-ink-400">
                <span className={cx('font-mono text-xs group-hover:hidden', isCur && 'hidden')}>{i + 1}</span>
                {isCur && <span className="group-hover:hidden"><EqIcon playing={playing} /></span>}
                <button onClick={() => playSongs(songs, i)} className="hidden text-ink-100 group-hover:block" aria-label={`Play ${s.title}`}>
                  <Play size={14} fill="currentColor" />
                </button>
              </span>
              <div className="flex min-w-0 items-center gap-3">
                <Cover path={s.coverPath} seed={s.id} size={40} bust={s.updatedAt} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cx('truncate font-medium', isCur && 'text-ember-400')}>{s.title}</span>
                    <VersionBadge song={s} count={versionsOf(groups, s).length} />
                  </div>
                  <div className="truncate text-xs text-ink-400">{s.artist || 'Unknown artist'}</div>
                </div>
              </div>
              <span className="hidden truncate text-ink-300 @[720px]:block">{s.album || <span className="text-ink-500">—</span>}</span>
              <span className="hidden truncate text-ink-400 @[720px]:block">{timeAgo(s.createdAt)}</span>
              <span className="text-right font-mono text-xs text-ink-400">{fmtTime(s.duration)}</span>
              <SongActions song={s} playlistId={playlistId} className="opacity-0 group-hover:opacity-100 focus-within:opacity-100" />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SongGrid({ songs }: { songs: Song[] }) {
  const groups = useVersionGroups()
  const playSongs = usePlayer((s) => s.playSongs)
  const current = usePlayer((s) => s.current())
  const playing = usePlayer((s) => s.playing)
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
      {songs.map((s, i) => (
        <div key={s.id} className="group relative rounded-xl bg-ink-850/50 p-3 transition hover:bg-ink-800">
          <div className="relative">
            <Cover path={s.coverPath} seed={s.id} size={200} bust={s.updatedAt} className="!h-auto !w-full aspect-square rounded-lg shadow-lg" />
            <button
              onClick={() => playSongs(songs, i)}
              aria-label={`Play ${s.title}`}
              className="absolute bottom-2 right-2 flex size-11 translate-y-2 items-center justify-center rounded-full forge-gradient text-on-accent opacity-0 shadow-xl transition group-hover:translate-y-0 group-hover:opacity-100"
            >
              <Play size={18} fill="currentColor" className="ml-0.5" />
            </button>
          </div>
          <div className="mt-3 flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <div className={cx('flex items-center gap-2 truncate text-sm font-semibold', current?.id === s.id && 'text-ember-400')}>
                {current?.id === s.id && <EqIcon playing={playing} />}
                <span className="truncate">{s.title}</span>
                <VersionBadge song={s} count={versionsOf(groups, s).length} />
              </div>
              <div className="truncate text-xs text-ink-400">{s.artist || 'Unknown artist'}</div>
            </div>
            <SongActions song={s} className="-mr-1 opacity-0 group-hover:opacity-100" />
          </div>
        </div>
      ))}
    </div>
  )
}
