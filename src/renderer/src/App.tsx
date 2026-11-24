import { useEffect, useRef, useState } from 'react'
import { applyTheme, resolveTheme, systemDarkQuery } from '@/lib/theme'
import { useApp } from '@/lib/store'
import { usePlayer } from '@/lib/player'
import { Sidebar } from '@/components/Sidebar'
import { PlayerBar } from '@/components/PlayerBar'
import { NowPlaying } from '@/components/NowPlaying'
import { Toasts } from '@/components/Toasts'
import { SongEditDialog } from '@/components/SongEditDialog'
import { ImportDialog } from '@/components/ImportDialog'
import { VersionsDialog } from '@/components/VersionsDialog'
import { ClipboardPrompt } from '@/components/ClipboardPrompt'
import { Onboarding } from '@/components/Onboarding'
import { Tour } from '@/components/Tour'
import { Sheets } from '@/components/Sheets'
import { UpdateBanner } from '@/components/UpdateBanner'
import { SelectionBar } from '@/components/SelectionBar'
import { useSelection } from '@/lib/selection'
import { HelpPage } from '@/pages/Help'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { ForgePage } from '@/pages/Forge'
import { EditorPage } from '@/pages/Editor'
import { LibraryPage } from '@/pages/Library'
import { PlaylistPage } from '@/pages/Playlist'
import { SpotifyPage } from '@/pages/Spotify'
import { SettingsPage } from '@/pages/Settings'

export default function App() {
  const route = useApp((s) => s.route)
  const refresh = useApp((s) => s.refresh)
  const expanded = usePlayer((s) => s.expanded)

  const settings = useApp((s) => s.settings)
  const narrow = useMediaQuery('(max-width: 1100px)')
  const railOnly = route.name === 'editor' || narrow
  const [systemDark, setSystemDark] = useState(() => systemDarkQuery().matches)

  useEffect(() => {
    refresh()
    const q = systemDarkQuery()
    const h = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    q.addEventListener('change', h)
    return () => q.removeEventListener('change', h)
  }, [refresh])

  // A selection belongs to the page it was made on, and every page opens at the top
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    useSelection.getState().clear()
    scroller.current?.scrollTo(0, 0)
  }, [route])

  // Apply theme whenever appearance settings or the OS theme change
  useEffect(() => {
    if (!settings) return
    const root = document.documentElement
    root.classList.add('theme-anim')
    applyTheme(resolveTheme(settings, systemDark))
    const t = setTimeout(() => root.classList.remove('theme-anim'), 300)
    return () => clearTimeout(t)
  }, [settings?.appearance, settings?.darkTheme, settings?.lightTheme, settings?.accent, settings?.customAccent, systemDark])

  // Global keyboard shortcuts (ignored while typing or inside the clip editor, which has its own)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      // Ctrl+N: back to the Forge from anywhere, ready to paste
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !e.shiftKey) {
        e.preventDefault()
        useApp.getState().navigate({ name: 'forge' })
        return
      }
      if (t.closest('input, textarea, [contenteditable]')) return
      if (useApp.getState().route.name === 'editor') return
      // Ctrl+A: tick every song the library or playlist shows
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && ['library', 'playlist'].includes(useApp.getState().route.name) && !document.querySelector('[role="dialog"]')) {
        e.preventDefault()
        useSelection.getState().selectAll()
        return
      }
      const p = usePlayer.getState()
      if (e.code === 'Space') {
        e.preventDefault()
        p.toggle()
      } else if (e.code === 'ArrowRight' && e.ctrlKey) p.next()
      else if (e.code === 'ArrowLeft' && e.ctrlKey) p.prev()
      else if (e.code === 'ArrowRight') p.seek(Math.min(p.duration, p.time + 5))
      else if (e.code === 'ArrowLeft') p.seek(Math.max(0, p.time - 5))
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <div className={`grid h-full ${railOnly ? 'grid-cols-[64px_minmax(0,1fr)]' : 'grid-cols-[248px_minmax(0,1fr)]'} grid-rows-[minmax(0,1fr)_88px] bg-ink-950 text-ink-100`}>
      <Sidebar collapsed={railOnly} />
      <main className="relative row-start-1 col-start-2 min-h-0 overflow-hidden rounded-tl-2xl bg-ink-900 border-l border-t border-ink-800">
        <div className="drag absolute inset-x-0 top-0 h-10 z-0" />
        <div ref={scroller} className="relative h-full overflow-y-auto">
          {route.name === 'forge' && <ForgePage />}
          {route.name === 'editor' && (
            <EditorPage key={route.source.id + (route.editSong?.id ?? '')} source={route.source} editSong={route.editSong} session={route.session} />
          )}
          {route.name === 'library' && <LibraryPage />}
          {route.name === 'playlist' && <PlaylistPage key={route.id} id={route.id} />}
          {route.name === 'spotify' && <SpotifyPage />}
          {route.name === 'settings' && <SettingsPage />}
          {route.name === 'help' && <HelpPage />}
        </div>
        <SelectionBar />
      </main>
      <PlayerBar />
      {expanded && <NowPlaying />}
      <SongEditDialog />
      <ImportDialog />
      <VersionsDialog />
      <ClipboardPrompt />
      {settings && !settings.onboarded && <Onboarding onImport={() => useApp.getState().setImportOpen(true)} />}
      <Sheets />
      <UpdateBanner />
      <Tour />
      <Toasts />
    </div>
  )
}
