import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, FileAudio, FolderOpen, Loader2, Upload } from 'lucide-react'
import type { ImportResult } from '@shared/types'
import { api, newJobId } from '@/lib/api'
import { useApp } from '@/lib/store'
import { cleanError } from '@/lib/queue'
import { Button, Modal, ProgressBar, cx } from './ui'

/** Bring songs you already have (MP3, M4A, FLAC, WAV…) into the library and Spotify folder. */
export function ImportDialog() {
  const open = useApp((s) => s.importOpen)
  const handed = useApp((s) => s.importFiles)
  const setOpen = useApp((s) => s.setImportOpen)
  const refresh = useApp((s) => s.refresh)
  const toast = useApp((s) => s.toast)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ pct: 0, file: '' })
  const [result, setResult] = useState<ImportResult | null>(null)
  const [over, setOver] = useState(false)
  const job = useRef('')

  useEffect(() => {
    if (open) {
      setResult(null)
      setProgress({ pct: 0, file: '' })
    }
  }, [open])
  useEffect(
    () =>
      api.onProgress((e) => {
        if (e.jobId === job.current) setProgress({ pct: e.percent, file: e.detail ?? '' })
      }),
    []
  )

  // Packs double-clicked in Explorer or dropped on the Forge page start right away
  useEffect(() => {
    if (open && handed?.length && !busy) {
      useApp.setState({ importFiles: null })
      run(handed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, handed])

  const run = async (paths: string[]) => {
    if (!paths.length) return
    setBusy(true)
    setResult(null)
    job.current = newJobId()
    try {
      const r = await api.song.import(job.current, paths)
      setResult(r)
      await refresh()
      if (r.added) api.notify(`Imported ${r.added} song${r.added === 1 ? '' : 's'}`, 'They are in your library and Spotify folder.')
    } catch (e) {
      toast({ kind: 'error', title: 'Import failed', body: cleanError(e) })
    }
    setBusy(false)
  }

  return (
    <Modal open={open} onClose={() => !busy && setOpen(false)} title="Import songs" width="max-w-lg">
      {!busy && !result && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              run([...e.dataTransfer.files].map((f) => api.filePathFor(f)).filter(Boolean))
            }}
            className={cx(
              'flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
              over ? 'border-ember-500 bg-ember-500/10' : 'border-ink-600'
            )}
          >
            <div className="flex size-12 items-center justify-center rounded-2xl bg-ink-800 text-ember-400">
              <Upload size={22} />
            </div>
            <div>
              <div className="font-semibold">Drop songs, a folder or a song pack here</div>
              <div className="mt-1 text-xs text-ink-400">MP3, M4A, FLAC, WAV, OGG and more, or a .songforge pack from a friend</div>
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="primary" icon={<FileAudio size={14} />} onClick={async () => run(await api.dialog.pickSongs(false))}>
                Choose files
              </Button>
              <Button size="sm" icon={<FolderOpen size={14} />} onClick={async () => run(await api.dialog.pickSongs(true))}>
                Choose a folder
              </Button>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-ink-400">
            Title, artist, album, cover art and lyrics are read from the files. MP3s are copied into your SongForge folder so Spotify sees them, and other formats are converted to MP3. Your
            originals aren't changed. A song pack also arrives as a playlist.
          </p>
        </>
      )}
      {busy && (
        <div className="py-8">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Loader2 size={15} className="animate-spin" /> Importing…
            </span>
            <span className="font-mono text-xs text-ink-400">{Math.round(progress.pct)}%</span>
          </div>
          <ProgressBar value={progress.pct} />
          <div className="mt-2 truncate text-xs text-ink-400">{progress.file}</div>
        </div>
      )}
      {result && (
        <div className="py-4 text-center">
          <CheckCircle2 size={36} className="mx-auto text-emerald-400" />
          <div className="mt-3 text-lg font-semibold">
            {result.added ? `Added ${result.added} song${result.added === 1 ? '' : 's'}` : 'No new songs added'}
          </div>
          <div className="mt-1 text-sm text-ink-400">
            {result.skipped > 0 && `${result.skipped} already in your library. `}
            {result.errors.length > 0 && `${result.errors.length} couldn't be read.`}
          </div>
          {!!result.playlists?.length && (
            <div className="mt-2 text-sm text-ink-300">
              Added the playlist{result.playlists.length > 1 ? 's' : ''} <b>{result.playlists.join(', ')}</b>.
            </div>
          )}
          {result.errors.length > 0 && (
            <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-ink-950 p-3 text-left font-mono text-[11px] text-ink-400 select-text">{result.errors.join('\n')}</pre>
          )}
          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={() => setResult(null)}>Import more</Button>
            <Button
              variant="primary"
              onClick={() => {
                setOpen(false)
                useApp.getState().navigate({ name: 'library' })
              }}
            >
              Go to library
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
