import { useEffect, useState } from 'react'
import { ArrowUpCircle, Loader2, RotateCw, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { Button, IconButton, ProgressBar } from './ui'

/** Keeps the update state in the store and shows a small card when a new version is out. */
export function UpdateBanner() {
  const update = useApp((s) => s.update)
  const setUpdate = useApp((s) => s.setUpdate)
  const [hidden, setHidden] = useState<string | null>(null)

  useEffect(() => {
    api.updates.state().then(setUpdate)
    return api.updates.onState(setUpdate)
  }, [setUpdate])

  if (!update || !['available', 'downloading', 'ready'].includes(update.status)) return null
  if (hidden === `${update.status}:${update.version}`) return null

  return (
    <div className="fixed bottom-[100px] right-4 z-40 w-[min(360px,calc(100vw-32px))] animate-[sf-drop_.18s_ease-out] rounded-2xl border border-ink-600 bg-ink-800/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl forge-gradient text-on-accent">
          <ArrowUpCircle size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {update.status === 'ready' ? `SongForge ${update.version} is ready` : `SongForge ${update.version} is out`}
          </div>
          <div className="mt-0.5 text-xs leading-relaxed text-ink-400">
            {update.status === 'ready'
              ? 'Restart to finish updating. Your songs and settings stay as they are.'
              : update.status === 'downloading'
                ? 'Downloading in the background…'
                : `You have ${update.current}. The update keeps your songs and settings.`}
          </div>
          {update.status === 'downloading' && <ProgressBar value={update.percent ?? 0} className="mt-2" />}
          <div className="mt-3 flex gap-2">
            {update.status === 'available' && (
              <Button size="sm" variant="primary" onClick={() => api.updates.download()}>
                Download update
              </Button>
            )}
            {update.status === 'downloading' && (
              <Button size="sm" disabled icon={<Loader2 size={13} className="animate-spin" />}>
                {Math.round(update.percent ?? 0)}%
              </Button>
            )}
            {update.status === 'ready' && (
              <Button size="sm" variant="primary" icon={<RotateCw size={13} />} onClick={() => api.updates.install()}>
                Restart now
              </Button>
            )}
            {update.status !== 'downloading' && (
              <Button size="sm" variant="ghost" onClick={() => setHidden(`${update.status}:${update.version}`)}>
                Later
              </Button>
            )}
          </div>
        </div>
        <IconButton label="Hide" size="sm" onClick={() => setHidden(`${update.status}:${update.version}`)}>
          <X size={15} />
        </IconButton>
      </div>
    </div>
  )
}
