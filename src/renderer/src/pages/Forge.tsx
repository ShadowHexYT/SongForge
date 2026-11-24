import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  ClipboardPaste,
  Search,
  Loader2,
  Play,
  History,
  Link2,
  X,
  Plus,
  CheckCircle2,
  AlertCircle,
  FolderClock,
  Trash2,
  ListPlus,
  Scissors,
  FileAudio,
  Upload,
  Headphones,
  Wand2
} from 'lucide-react'
import { SITES, isPlaylistUrl } from '@shared/sites'
import { Anvil } from '@/components/ForgeIcons'
import { SongActions } from '@/components/SongActions'
import type { SearchResult, Session } from '@shared/types'
import { api, mediaUrl } from '@/lib/api'
import { useApp } from '@/lib/store'
import { usePlayer } from '@/lib/player'
import { addFile, cleanError, extractUrls, queueLinks, useQueue } from '@/lib/queue'
import { fmtTime, timeAgo } from '@/lib/format'
import { Button, Cover, IconButton, ProgressBar, cx } from '@/components/ui'

type Recent = Awaited<ReturnType<typeof api.source.recent>>

const fmtViews = (n?: number) => (!n ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M views` : n >= 1e3 ? `${Math.round(n / 1e3)}K views` : `${n} views`)

export function ForgePage() {
  const navigate = useApp((s) => s.navigate)
  const toast = useApp((s) => s.toast)
  const songs = useApp((s) => s.library.songs)
  const playSongs = usePlayer((s) => s.playSongs)
  const queue = useQueue()
  const [text, setText] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [lastQuery, setLastQuery] = useState('')
  const [recent, setRecent] = useState<Recent>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [dropping, setDropping] = useState(false)
  const setImportOpen = useApp((s) => s.setImportOpen)

  const urls = useMemo(() => extractUrls(text), [text])
  const mode: 'links' | 'search' | 'empty' = urls.length ? 'links' : text.trim() ? 'search' : 'empty'

  useEffect(() => {
    api.source.recent().then(setRecent)
    api.session.list().then(setSessions)
    inputRef.current?.focus()
  }, [])

  const submit = async (value = text) => {
    const found = extractUrls(value)
    if (found.length) {
      const { videos } = queueLinks(found)
      setText('')
      if (videos > 1) toast({ kind: 'info', title: `Queued ${videos} videos`, body: 'They download in the background. Open each one when it’s ready.' })
      return
    }
    const q = value.trim()
    if (!q) return
    setSearching(true)
    setLastQuery(q)
    try {
      setResults(await api.youtube.search(q))
    } catch (e) {
      toast({ kind: 'error', title: 'Search failed', body: cleanError(e) })
    }
    setSearching(false)
  }

  const pasteFromClipboard = async () => {
    const t = (await api.clipboard.read()).trim()
    setText(t)
    if (extractUrls(t).length) submit(t)
    else inputRef.current?.focus()
  }

  const openSession = (s: Session) => queue.add([{ url: s.url, title: s.title }], true)
  const deleteSession = async (s: Session) => {
    await api.session.delete(s.sourceId)
    setSessions((xs) => xs.filter((x) => x.sourceId !== s.sourceId))
  }

  const openFile = async () => {
    const p = await api.dialog.pickMedia()
    if (p) addFile(p)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropping(false)
    const files = [...e.dataTransfer.files].map((f) => api.filePathFor(f)).filter(Boolean)
    if (files.some((f) => f.toLowerCase().endsWith('.songforge'))) setImportOpen(true, files)
    else if (files.length === 1) addFile(files[0])
    else if (files.length > 1) {
      // Several files: they're probably songs to add to the library as they are
      api.song.import('drop', files).then(async (r) => {
        await useApp.getState().refresh()
        toast({ kind: 'success', title: `Imported ${r.added} song${r.added === 1 ? '' : 's'}`, body: r.skipped ? `${r.skipped} were already in your library.` : undefined })
      })
    } else {
      const t = e.dataTransfer.getData('text')
      if (t) submit(t)
    }
  }

  const queued = queue.items.filter((i) => i.status !== 'opened')
  const isNew = !songs.length && !sessions.length && !queued.length && !results
  const inQueue = (url: string) => queue.items.some((i) => i.url === url && i.status !== 'opened' && i.status !== 'error')

  return (
    <div
      className="relative mx-auto max-w-6xl px-6 pt-14 pb-16 lg:px-10"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDropping(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropping(false)
      }}
      onDrop={onDrop}
    >
      {dropping && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-ink-950/70 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-ember-500 bg-ink-900/90 px-12 py-10 text-center">
            <Upload size={32} className="mx-auto text-ember-400" />
            <div className="mt-3 text-lg font-semibold">Drop to open</div>
            <div className="mt-1 text-sm text-ink-400">One file opens in the editor. Several files or a song pack are added to your library.</div>
          </div>
        </div>
      )}
      <div className="relative">
        <div className="pointer-events-none absolute -top-24 left-1/3 h-64 w-[640px] -translate-x-1/2 rounded-full bg-ember-500/15 blur-3xl" />
        <p className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ember-400">
          <Anvil size={15} /> Forge
        </p>
        <h1 className="relative mt-3 text-[clamp(28px,3.6vw,40px)] font-bold leading-[1.08] tracking-tight">
          Turn any video moment into a <span className="forge-text">song you own.</span>
        </h1>
      </div>

      {/* Smart input: links → queue, text → search */}
      <form
        className="relative mt-8"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div data-tour="forge-input" className="flex items-start gap-2 rounded-2xl border border-ink-600 bg-ink-850 p-2 pl-5 shadow-xl transition focus-within:border-ember-500/60 focus-within:shadow-glow">
          <div className="pt-3.5 text-ink-400">{mode === 'links' ? <Link2 size={20} className="text-ember-400" /> : <Search size={20} />}</div>
          <textarea
            ref={inputRef}
            value={text}
            rows={Math.min(5, Math.max(1, text.split('\n').length))}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            onPaste={(e) => {
              const t = e.clipboardData.getData('text')
              const found = extractUrls(t)
              if (found.length && !text.trim()) {
                e.preventDefault()
                submit(t)
              }
            }}
            placeholder="Paste links or search YouTube, e.g. “Chaewon live vocals”"
            className="min-h-12 flex-1 resize-none bg-transparent py-3 text-[15px] leading-6 outline-none placeholder:text-ink-400"
          />
          {mode === 'links' && (
            <span className="mt-2.5 rounded-full bg-ember-500/15 px-3 py-1.5 text-xs font-medium text-ember-400">
              {urls.length} link{urls.length > 1 ? 's' : ''}
            </span>
          )}
          {mode === 'empty' && (
            <>
              <Button type="button" variant="ghost" className="mt-1.5 max-md:hidden" onClick={pasteFromClipboard} icon={<ClipboardPaste size={16} />}>
                Paste
              </Button>
              <Button type="button" variant="ghost" className="mt-1.5" data-tour="forge-file" onClick={openFile} icon={<FileAudio size={16} />} title="Open an audio or video file from this PC">
                <span className="max-md:hidden">File</span>
              </Button>
            </>
          )}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="mt-0.5"
            disabled={mode === 'empty' || searching}
            icon={searching ? <Loader2 size={18} className="animate-spin" /> : mode === 'links' ? <ArrowRight size={18} /> : <Search size={17} />}
          >
            {mode === 'links' ? (urls.length > 1 ? 'Queue all' : urls.some(isPlaylistUrl) ? 'Choose videos' : 'Forge') : 'Search'}
          </Button>
        </div>
        <p className="mt-2.5 pl-2 text-xs leading-relaxed text-ink-400">
          Paste several links, a whole playlist or a channel, or drop a file here. Links with <span className="font-mono">&amp;t=</span> start the clip at that time.
        </p>
      </form>

      {/* First visit: how it works */}
      {isNew && (
        <section className="mt-10">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: <Scissors size={18} />, title: 'Paste & clip', body: 'Paste a link or search. Drag across the waveform to mark the song, or let SongForge find the songs for you.' },
              { icon: <Wand2 size={18} />, title: 'Name & polish', body: 'Title, artist and cover fill in automatically. Add lyrics, a sped-up or slowed style, reverb or EQ.' },
              { icon: <Headphones size={18} />, title: 'Listen anywhere', body: 'Play here with synced lyrics, or in Spotify through Local Files on your PC and phone.' }
            ].map((c, i) => (
              <div key={c.title} className="rounded-2xl border border-ink-700 bg-ink-850 p-5">
                <div className="flex items-center gap-2 text-ember-400">
                  {c.icon}
                  <span className="font-mono text-[11px] text-ink-500">0{i + 1}</span>
                </div>
                <div className="mt-3 font-semibold">{c.title}</div>
                <div className="mt-1 text-sm leading-relaxed text-ink-400">{c.body}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-dashed border-ink-600 px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Already have songs?</div>
              <div className="text-xs text-ink-400">Import MP3s and other audio files to play them here with everything else.</div>
            </div>
            <Button icon={<Upload size={15} />} onClick={() => setImportOpen(true)}>
              Import songs
            </Button>
          </div>
          <p className="mt-6 text-xs leading-relaxed text-ink-500">
            Works with {SITES.map((s) => s.name).join(', ')} and many more sites, plus audio and video files on your PC.
          </p>
        </section>
      )}

      {/* Queue */}
      {queued.length > 0 && (
        <section className="mt-8 rounded-2xl border border-ink-700 bg-ink-850">
          <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ListPlus size={16} className="text-ink-400" /> Queue
              <span className="text-ink-400">{queued.length}</span>
            </h2>
            <Button size="sm" variant="ghost" onClick={queue.clearDone}>
              Clear finished
            </Button>
          </div>
          <div className="divide-y divide-ink-700/60">
            {queued.map((it) => (
              <div key={it.id} className="flex items-center gap-4 px-5 py-3">
                <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-ink-800">
                  {(it.source?.thumbnailPath || it.thumbnail) && (
                    <img src={it.source?.thumbnailPath ? mediaUrl(it.source.thumbnailPath) : it.thumbnail} alt="" className="size-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{it.title ?? it.url}</div>
                  {it.status === 'loading' || it.status === 'waiting' ? (
                    <div className="mt-1.5 flex items-center gap-3">
                      <ProgressBar value={it.progress} className="max-w-xs" />
                      <span className="shrink-0 text-xs text-ink-400">
                        {it.stage} {it.status === 'loading' && `${Math.round(it.progress)}%`}
                      </span>
                    </div>
                  ) : it.status === 'error' ? (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-red-400">
                      <AlertCircle size={13} /> {it.error}
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-400">
                      <CheckCircle2 size={13} /> Ready · {fmtTime(it.source?.duration ?? 0)}
                    </div>
                  )}
                </div>
                {it.status === 'ready' && (
                  <Button size="sm" variant="primary" onClick={() => queue.open(it.id)} icon={<Scissors size={14} />}>
                    <span className="max-md:hidden">Open editor</span>
                  </Button>
                )}
                <IconButton label="Remove" size="sm" onClick={() => queue.remove(it.id)} disabled={it.status === 'loading'}>
                  <X size={15} />
                </IconButton>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Search results */}
      {results && (
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-200">
              Results for <span className="text-ink-100">“{lastQuery}”</span>
            </h2>
            <IconButton label="Close results" size="sm" onClick={() => setResults(null)}>
              <X size={16} />
            </IconButton>
          </div>
          {results.length === 0 ? (
            <p className="text-sm text-ink-400">No results.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
              {results.map((r) => {
                const queuedAlready = inQueue(r.url)
                return (
                  <div key={r.id} className="group overflow-hidden rounded-xl border border-ink-700 bg-ink-850 transition hover:border-ink-500">
                    <button className="relative block aspect-video w-full bg-ink-800" onClick={() => queue.add([{ url: r.url, title: r.title, thumbnail: r.thumbnail }], true)}>
                      <img src={r.thumbnail} alt="" className="size-full object-cover transition group-hover:scale-105" loading="lazy" />
                      {r.duration > 0 && <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white">{fmtTime(r.duration)}</span>}
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                        <span className="flex items-center gap-2 rounded-full forge-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-accent">
                          <Scissors size={15} /> Forge
                        </span>
                      </span>
                    </button>
                    <div className="flex gap-2 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-[13px] font-medium leading-snug" title={r.title}>
                          {r.title}
                        </div>
                        <div className="mt-1 truncate text-xs text-ink-400">
                          {r.channel}
                          {r.views ? ` · ${fmtViews(r.views)}` : ''}
                        </div>
                      </div>
                      <IconButton
                        label={queuedAlready ? 'In queue' : 'Add to queue'}
                        size="sm"
                        active={queuedAlready}
                        disabled={queuedAlready}
                        onClick={() => queue.add([{ url: r.url, title: r.title, thumbnail: r.thumbnail }])}
                      >
                        {queuedAlready ? <CheckCircle2 size={15} /> : <Plus size={16} />}
                      </IconButton>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Recently forged: one row, newest first */}
      {!results && songs.length > 0 && (
        <section className="mt-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-200">
              <Anvil size={16} className="text-ink-400" /> Recently forged
            </h2>
            <button onClick={() => navigate({ name: 'library' })} className="text-xs text-ink-400 hover:text-ink-100">
              See all →
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 min-[1200px]:grid-cols-6">
            {songs.slice(0, 6).map((s, i) => (
              <div key={s.id} className="group relative min-w-0 rounded-xl p-2 transition hover:bg-ink-850">
                <button onClick={() => playSongs(songs.slice(0, 6), i)} className="relative block w-full" aria-label={`Play ${s.title}`}>
                  <Cover path={s.coverPath} seed={s.id} size={160} bust={s.updatedAt} className="!h-auto !w-full aspect-square rounded-lg shadow-lg" />
                  <span className="absolute bottom-2 right-2 flex size-9 translate-y-2 items-center justify-center rounded-full forge-gradient text-on-accent opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100">
                    <Play size={16} fill="currentColor" className="ml-0.5" />
                  </span>
                </button>
                <div className="mt-2 flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{s.title}</div>
                    <div className="truncate text-xs text-ink-400">
                      {s.artist || 'Unknown artist'} · {timeAgo(s.createdAt)}
                    </div>
                  </div>
                  <SongActions song={s} className="-mr-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Drafts */}
      {sessions.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink-200">
            <FolderClock size={16} className="text-ink-400" /> Continue where you left off
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {sessions.slice(0, 6).map((s) => (
              <div key={s.sourceId} className="group flex gap-3 rounded-xl border border-ink-700 bg-ink-850 p-3 transition hover:border-ink-500">
                <button onClick={() => openSession(s)} className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-ink-800">
                  {s.thumbnailPath && <img src={mediaUrl(s.thumbnailPath)} alt="" className="size-full object-cover" />}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition group-hover:opacity-100">
                    <Scissors size={18} />
                  </span>
                </button>
                <button onClick={() => openSession(s)} className="min-w-0 flex-1 text-left">
                  <div className="line-clamp-2 text-[13px] font-medium leading-snug">{s.title}</div>
                  <div className="mt-1 text-xs text-ink-400">
                    {s.clipCount} clip{s.clipCount === 1 ? '' : 's'} · {s.forgedCount} forged · {timeAgo(s.updatedAt)}
                  </div>
                </button>
                <IconButton label="Discard draft" size="sm" className="opacity-0 group-hover:opacity-100" onClick={() => deleteSession(s)}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent sources */}
      {!results && recent.filter((r) => !sessions.some((s) => s.sourceId === r.id)).length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink-200">
            <History size={16} className="text-ink-400" /> Recent sources
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            {recent
              .filter((r) => !sessions.some((s) => s.sourceId === r.id))
              .slice(0, 8)
              .map((r) => (
                <button
                  key={r.id}
                  onClick={() => queue.add([{ url: r.url, title: r.title }], true)}
                  className={cx('group overflow-hidden rounded-xl border border-ink-700 bg-ink-850 text-left transition hover:border-ink-500')}
                >
                  <div className="relative aspect-video bg-ink-800">
                    {r.thumbnailPath && <img src={mediaUrl(r.thumbnailPath)} alt="" className="size-full object-cover transition group-hover:scale-105" />}
                    <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white">{fmtTime(r.duration)}</span>
                  </div>
                  <div className="p-3">
                    <div className="line-clamp-2 text-[13px] font-medium leading-snug">{r.title}</div>
                    <div className="mt-1 truncate text-xs text-ink-400">{r.channel}</div>
                  </div>
                </button>
              ))}
          </div>
        </section>
      )}

    </div>
  )
}
