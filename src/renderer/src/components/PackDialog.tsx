import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, FolderOpen, Loader2, Package } from 'lucide-react'
import { api, newJobId } from '@/lib/api'
import { useApp } from '@/lib/store'
import { cleanError } from '@/lib/queue'
import { fmtDuration } from '@/lib/format'
import { Button, Field, Input, Modal, ProgressBar } from './ui'
import { SongChecklist } from './SongChecklist'

/** Share songs with a friend as one .songforge file. They open it in SongForge to add everything. */
export function PackDialog({ songIds: initial, name: initialName }: { songIds: string[]; name: string }) {
  const close = () => useApp.getState().openSheet(null)
  const songs = useApp((s) => s.library.songs)
  const toast = useApp((s) => s.toast)
  const [ids, setIds] = useState(initial)
  const [name, setName] = useState(initialName)
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(0)
  const [done, setDone] = useState<{ count: number; missing: number; path: string } | null>(null)
  const job = useRef('')

  useEffect(() => api.onProgress((e) => e.jobId === job.current && setPct(e.percent)), [])

  const picked = songs.filter((s) => ids.includes(s.id))
  const total = picked.reduce((a, s) => a + s.duration, 0)

  const save = async () => {
    setBusy(true)
    setPct(0)
    job.current = newJobId()
    try {
      const r = await api.pack.export(job.current, ids, name.trim() || 'Song pack')
      if (r) setDone(r)
    } catch (e) {
      toast({ kind: 'error', title: "Couldn't save the pack", body: cleanError(e) })
    }
    setBusy(false)
  }

  return (
    <Modal open onClose={() => !busy && close()} title="Share a song pack" width="max-w-xl">
      {done ? (
        <div className="py-4 text-center">
          <CheckCircle2 size={36} className="mx-auto text-emerald-400" />
          <div className="mt-3 text-lg font-semibold">
            Packed {done.count} song{done.count === 1 ? '' : 's'}
          </div>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-400">
            Send the <span className="font-mono text-ink-200">.songforge</span> file to a friend (Discord, Google Drive, a USB stick…). They open it in SongForge and get every song with its cover, tags and
            lyrics.
            {done.missing > 0 && ` ${done.missing} song${done.missing === 1 ? ' was' : 's were'} skipped because the MP3 is missing.`}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button icon={<FolderOpen size={15} />} onClick={() => api.song.reveal(done.path)}>
              Show file
            </Button>
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-ink-400">
            Pick songs to send. They're saved together in one file with covers, tags, lyrics and versions. Nothing about your PC is included.
          </p>
          <Field label="Pack name" hint="Your friend gets a playlist with this name.">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Road trip" maxLength={80} />
          </Field>
          <SongChecklist selected={ids} onChange={setIds} />
          {busy && <ProgressBar value={pct} />}
          <div className="flex items-center gap-3">
            <span className="flex-1 text-xs text-ink-400">
              {ids.length} song{ids.length === 1 ? '' : 's'}
              {total > 0 && ` · ${fmtDuration(total)}`}
            </span>
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={!ids.length || busy} icon={busy ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}>
              Save pack…
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
