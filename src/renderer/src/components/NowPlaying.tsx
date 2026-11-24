import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ExternalLink, Layers, ListMusic, Mic2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import type { Song } from '@shared/types'
import { parseLrc } from '@shared/lrc'
import { siteName } from '@shared/sites'
import { versionTags } from '@shared/versions'
import { usePlayer } from '@/lib/player'
import { useApp } from '@/lib/store'
import { resolveTheme } from '@/lib/theme'
import { api, mediaUrl } from '@/lib/api'
import { fmtTime } from '@/lib/format'
import { useVersionGroups, versionsOf } from '@/lib/versions'
import { Cover, IconButton, Range, cx, EqIcon } from './ui'
import { playVersion, VersionTag } from './VersionsDialog'

type Panel = 'lyrics' | 'next' | 'versions'

export function NowPlaying() {
  const p = usePlayer()
  const settings = useApp((s) => s.settings)
  const groups = useVersionGroups()
  const song = p.current()
  const versions = song ? versionsOf(groups, song) : []
  const hasLyrics = !!(song?.syncedLyrics?.trim() || song?.lyrics?.trim())
  const [panel, setPanel] = useState<Panel>(hasLyrics ? 'lyrics' : 'next')
  useEffect(() => {
    if (panel === 'lyrics' && !hasLyrics) setPanel('next')
    if (panel === 'versions' && versions.length < 2) setPanel(hasLyrics ? 'lyrics' : 'next')
  }, [song?.id, hasLyrics, versions.length, panel])
  if (!song) return null
  // Now Playing always uses the user's dark palette: artwork looks best on dark.
  const darkVars = settings ? resolveTheme({ ...settings, appearance: 'dark' }, true).vars : {}
  const upNext = p.order.slice(p.pos + 1, p.pos + 30).map((i) => p.queue[i])
  const site = song.sourceUrl.startsWith('file:') ? null : siteName(song.sourceUrl) ?? 'source'

  const tabs: Array<{ id: Panel; label: string; icon: typeof Mic2; show: boolean }> = [
    { id: 'lyrics', label: 'Lyrics', icon: Mic2, show: hasLyrics },
    { id: 'next', label: 'Up next', icon: ListMusic, show: true },
    { id: 'versions', label: `Versions · ${versions.length}`, icon: Layers, show: versions.length > 1 }
  ]

  return (
    <div className="fixed inset-x-0 top-0 bottom-[88px] z-40 overflow-hidden bg-ink-950 text-ink-100" style={darkVars as React.CSSProperties}>
      {song.coverPath && <img src={mediaUrl(song.coverPath, song.updatedAt)} alt="" className="absolute inset-0 size-full scale-125 object-cover opacity-35 blur-3xl" />}
      <div className="absolute inset-0 bg-gradient-to-b from-ink-950/40 via-ink-950/70 to-ink-950" />
      <div className="drag absolute inset-x-0 top-0 h-10" />
      <IconButton label="Close" className="no-drag absolute left-5 top-11 z-10" onClick={() => p.setExpanded(false)}>
        <ChevronDown size={22} />
      </IconButton>
      <div className="relative h-full overflow-y-auto px-6 pt-14 pb-6 lg:px-12">
        <div className="mx-auto grid min-h-full w-full max-w-[1500px] items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(300px,clamp(340px,30vw,560px))] lg:gap-14">
          {/* Artwork + controls */}
          <div className="flex min-h-0 flex-col items-center gap-6 py-2">
            <div className="aspect-square w-[min(560px,calc(100vh-430px),72vw)] min-w-[180px] overflow-hidden rounded-2xl shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)]">
              <Cover path={song.coverPath} seed={song.id} size={380} bust={song.updatedAt} className="!size-full !rounded-none" />
            </div>
            <div className="w-full max-w-[min(560px,90%)] text-center">
              <h1 className="truncate text-[clamp(22px,2.4vw,40px)] font-bold tracking-tight">{song.title}</h1>
              <p className="mt-1 truncate text-lg text-ink-300">
                {song.artist || 'Unknown artist'}
                {song.album && <span className="text-ink-400"> · {song.album}</span>}
              </p>
              {versionTags(song).length > 0 && (
                <div className="mt-2 flex justify-center gap-1">
                  {versionTags(song).map((t) => (
                    <VersionTag key={t} label={t} />
                  ))}
                </div>
              )}
              <div className="mt-5 flex items-center gap-3 font-mono text-xs text-ink-300">
                <span className="w-10 text-right">{fmtTime(p.time)}</span>
                <Range label="Seek" value={p.time} max={p.duration || 1} onChange={p.seek} />
                <span className="w-10">{fmtTime(p.duration)}</span>
              </div>
              <div className="mt-4 flex items-center justify-center gap-4">
                <IconButton label="Previous" size="lg" onClick={p.prev}>
                  <SkipBack size={22} fill="currentColor" />
                </IconButton>
                <button onClick={p.toggle} aria-label="Play/Pause" className="flex size-16 items-center justify-center rounded-full bg-ink-100 text-ink-950 transition hover:scale-105">
                  {p.playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="ml-1" />}
                </button>
                <IconButton label="Next" size="lg" onClick={p.next}>
                  <SkipForward size={22} fill="currentColor" />
                </IconButton>
              </div>
              {site && (
                <button onClick={() => api.shell.openExternal(song.sourceUrl)} className="mt-5 inline-flex max-w-full items-center gap-1.5 truncate text-xs text-ink-400 hover:text-ink-200">
                  <ExternalLink size={12} /> From {site}: {song.sourceTitle}
                </button>
              )}
            </div>
          </div>

          {/* Side panel: lyrics / up next / versions */}
          <div className="flex h-[min(860px,calc(100vh-190px))] min-h-[320px] flex-col rounded-2xl bg-white/5 backdrop-blur">
            <div className="flex gap-1 p-2">
              {tabs
                .filter((t) => t.show)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setPanel(t.id)}
                    className={cx(
                      'flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition',
                      panel === t.id ? 'bg-white/15 text-ink-100' : 'text-ink-300 hover:bg-white/5 hover:text-ink-100'
                    )}
                  >
                    <t.icon size={13} />
                    {t.label}
                  </button>
                ))}
            </div>
            <div className="min-h-0 flex-1">
              {panel === 'lyrics' && <Lyrics key={song.id} song={song} />}
              {panel === 'next' && (
                <div className="h-full overflow-y-auto px-3 pb-3">
                  {upNext.length ? (
                    upNext.map((s, i) => (
                      <button key={s.id + i} onClick={() => p.jumpTo(p.pos + 1 + i)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/5">
                        <Cover path={s.coverPath} seed={s.id} size={40} bust={s.updatedAt} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{s.title}</div>
                          <div className="truncate text-xs text-ink-300">{s.artist}</div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="flex items-center gap-2 p-2 text-sm text-ink-400">{p.playing && <EqIcon />} End of queue</p>
                  )}
                </div>
              )}
              {panel === 'versions' && (
                <div className="h-full overflow-y-auto px-3 pb-3">
                  <p className="px-2 pb-2 text-xs text-ink-400">Click a version to switch at the same spot.</p>
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => playVersion(v, versions)}
                      className={cx('flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/5', v.id === song.id && 'bg-white/10')}
                    >
                      <Cover path={v.coverPath} seed={v.id} size={40} bust={v.updatedAt} />
                      <div className="min-w-0 flex-1">
                        <div className={cx('truncate text-sm font-medium', v.id === song.id && 'text-ember-400')}>{v.artist || v.title}</div>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {versionTags(v).map((t) => (
                            <VersionTag key={t} label={t} />
                          ))}
                          <span className="font-mono text-[10px] text-ink-400">{fmtTime(v.duration)}</span>
                        </div>
                      </div>
                      {v.id === song.id && p.playing && <EqIcon />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Synced lyrics scroll along and highlight; plain lyrics are just shown. */
function Lyrics({ song }: { song: Song }) {
  const time = usePlayer((s) => s.time)
  const seek = usePlayer((s) => s.seek)
  const lines = useMemo(() => (song.syncedLyrics ? parseLrc(song.syncedLyrics) : []), [song.syncedLyrics])
  const [offset, setOffset] = useState(song.lyricsOffset ?? 0)
  const listRef = useRef<HTMLDivElement>(null)
  const save = useRef<ReturnType<typeof setTimeout> | null>(null)

  const changeOffset = (o: number) => {
    const v = Math.round(o * 10) / 10
    setOffset(v)
    if (save.current) clearTimeout(save.current)
    save.current = setTimeout(async () => {
      await api.song.patch(song.id, { lyricsOffset: v })
      const lib = await api.library.get()
      useApp.getState().setLibrary(lib)
    }, 600)
  }

  const t = time + offset
  let active = -1
  for (let i = 0; i < lines.length; i++) if (lines[i].time <= t) active = i
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-line="${active}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active])

  if (!lines.length) {
    return <p className="h-full overflow-y-auto whitespace-pre-wrap px-5 pb-5 text-[15px] leading-7 text-ink-100 select-text">{song.lyrics}</p>
  }
  return (
    <div className="flex h-full flex-col">
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-[30%] [mask-image:linear-gradient(transparent,black_18%,black_82%,transparent)]">
        {lines.map((l, i) => (
          <button
            key={i}
            data-line={i}
            onClick={() => seek(Math.max(0, l.time - offset))}
            onDoubleClick={() => changeOffset(l.time - time)}
            title="Click to jump here. Double-click to line this up with what's playing now."
            className={cx(
              'block w-full py-1.5 text-left text-[clamp(17px,1.5vw,28px)] font-bold leading-snug transition-all duration-300',
              i === active ? 'origin-left scale-[1.02] text-ink-100' : i < active ? 'text-ink-400/70' : 'text-ink-400 hover:text-ink-200'
            )}
          >
            {l.text || '♪'}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-2 text-xs text-ink-300">
        <span title="Live versions often don't line up with the studio lyrics. Nudge them here.">Lyrics timing</span>
        <div className="flex items-center gap-1">
          <button onClick={() => changeOffset(offset - 0.5)} className="rounded-full px-2 py-1 hover:bg-white/10" title="Show lines later">
            Later
          </button>
          <span className="w-14 text-center font-mono">
            {offset > 0 ? '+' : ''}
            {offset.toFixed(1)}s
          </span>
          <button onClick={() => changeOffset(offset + 0.5)} className="rounded-full px-2 py-1 hover:bg-white/10" title="Show lines earlier">
            Earlier
          </button>
          {offset !== 0 && (
            <button onClick={() => changeOffset(0)} className="ml-1 rounded-full px-2 py-1 text-ink-400 hover:bg-white/10">
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
