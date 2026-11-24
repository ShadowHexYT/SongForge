import { Maximize2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX, Pencil } from 'lucide-react'
import { usePlayer } from '@/lib/player'
import { useApp } from '@/lib/store'
import { fmtTime } from '@/lib/format'
import { Cover, IconButton, Range } from './ui'

export function PlayerBar() {
  const p = usePlayer()
  const song = p.current()
  const editSong = useApp((s) => s.editSong)
  const VolIcon = p.muted || p.volume === 0 ? VolumeX : p.volume < 0.5 ? Volume1 : Volume2

  return (
    <footer data-tour="player" className="col-span-2 row-start-2 grid grid-cols-[minmax(0,1fr)_minmax(300px,1.4fr)_minmax(0,1fr)] items-center gap-4 border-t border-ink-800 bg-ink-950 px-4 lg:gap-6 lg:px-5">
      <div className="flex min-w-0 items-center gap-3">
        {song ? (
          <>
            <button onClick={() => p.setExpanded(true)} className="group relative" aria-label="Open now playing">
              <Cover path={song.coverPath} seed={song.id} size={56} bust={song.updatedAt} className="shadow-lg" />
              <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/50 opacity-0 transition group-hover:opacity-100">
                <Maximize2 size={16} />
              </span>
            </button>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{song.title}</div>
              <div className="truncate text-xs text-ink-300">{song.artist || 'Unknown artist'}</div>
            </div>
            <IconButton label="Edit song" size="sm" onClick={() => editSong(song)} className="ml-1 shrink-0 max-[1100px]:hidden">
              <Pencil size={14} />
            </IconButton>
          </>
        ) : (
          <div className="flex items-center gap-3 text-ink-400">
            <div className="size-14 shrink-0 rounded-md border border-dashed border-ink-600" />
            <span className="truncate text-sm">Nothing playing</span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2">
          <IconButton label="Shuffle" size="sm" active={p.shuffle} onClick={p.toggleShuffle}>
            <Shuffle size={16} />
          </IconButton>
          <IconButton label="Previous" onClick={p.prev} disabled={!song}>
            <SkipBack size={18} fill="currentColor" />
          </IconButton>
          <button
            onClick={p.toggle}
            disabled={!song}
            aria-label={p.playing ? 'Pause' : 'Play'}
            className="flex size-10 items-center justify-center rounded-full bg-ink-100 text-ink-950 transition hover:scale-105 active:scale-95 disabled:opacity-30"
          >
            {p.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
          </button>
          <IconButton label="Next" onClick={p.next} disabled={!song}>
            <SkipForward size={18} fill="currentColor" />
          </IconButton>
          <IconButton label={`Repeat: ${p.repeat}`} size="sm" active={p.repeat !== 'off'} onClick={p.cycleRepeat}>
            {p.repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
          </IconButton>
        </div>
        <div className="flex w-full items-center gap-2 font-mono text-[11px] text-ink-400">
          <span className="w-10 text-right tabular-nums">{fmtTime(p.time)}</span>
          <Range label="Seek" value={p.time} max={p.duration || 1} onChange={p.seek} />
          <span className="w-10 tabular-nums">{fmtTime(p.duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <IconButton label="Mute" size="sm" onClick={p.toggleMute}>
          <VolIcon size={16} />
        </IconButton>
        <Range label="Volume" className="max-w-28 max-[1000px]:hidden" value={p.muted ? 0 : p.volume} max={1} onChange={p.setVolume} />
        <IconButton label="Now playing" size="sm" onClick={() => p.setExpanded(true)} disabled={!song}>
          <Maximize2 size={15} />
        </IconButton>
      </div>
    </footer>
  )
}
