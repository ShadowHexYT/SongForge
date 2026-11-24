import { useEffect } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { PackDialog } from './PackDialog'
import { MedleyDialog } from './MedleyDialog'
import { DuplicatesDialog } from './DuplicatesDialog'
import { PlaylistPicker } from './PlaylistPicker'

/** Renders whichever helper window is open, and opens song packs double-clicked in Explorer. */
export function Sheets() {
  const sheet = useApp((s) => s.sheet)

  useEffect(() => {
    const open = (files: string[]) => files.length && useApp.getState().setImportOpen(true, files)
    api.app.pendingFiles().then(open)
    return api.app.onOpenFiles(open)
  }, [])

  if (!sheet) return null
  if (sheet.kind === 'pack') return <PackDialog songIds={sheet.songIds} name={sheet.name} />
  if (sheet.kind === 'medley') return <MedleyDialog songIds={sheet.songIds} />
  if (sheet.kind === 'dupes') return <DuplicatesDialog />
  return <PlaylistPicker key={sheet.urls[0]} urls={sheet.urls} />
}
