import { useState, type ComponentType } from 'react'
import { Library, ListMusic, Plus, Settings, Radio, Moon, Sun, Monitor, CircleHelp } from 'lucide-react'
import { Anvil } from './ForgeIcons'
import type { Appearance } from '@shared/types'
import { api } from '@/lib/api'
import { useApp, type Route } from '@/lib/store'
import { usePlayer } from '@/lib/player'
import { useQueue } from '@/lib/queue'
import { LogoMark } from './Logo'
import { cx, EqIcon } from './ui'

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const route = useApp((s) => s.route)
  const navigate = useApp((s) => s.navigate)
  const library = useApp((s) => s.library)
  const refresh = useApp((s) => s.refresh)
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const current = usePlayer((s) => s.current())
  const playing = usePlayer((s) => s.playing)
  const queueBusy = useQueue((s) => s.items.filter((i) => i.status === 'loading' || i.status === 'waiting').length)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const forgeActive = route.name === 'forge' || route.name === 'editor'
  const nav: Array<{ r: Route; label: string; icon: ComponentType<{ size?: number; className?: string }>; badge?: number }> = [
    { r: { name: 'library' }, label: 'Library', icon: Library, badge: library.songs.length },
    { r: { name: 'spotify' }, label: 'Spotify Sync', icon: Radio },
    { r: { name: 'settings' }, label: 'Settings', icon: Settings },
    { r: { name: 'help' }, label: 'Help & tutorial', icon: CircleHelp }
  ]
  const isActive = (r: Route) => route.name === r.name

  const create = async () => {
    const n = name.trim()
    setCreating(false)
    setName('')
    if (!n) return
    const id = await api.playlist.create(n)
    await refresh()
    navigate({ name: 'playlist', id })
  }

  const cycleAppearance = async () => {
    if (!settings) return
    const order: Appearance[] = ['dark', 'light', 'system']
    const appearance = order[(order.indexOf(settings.appearance) + 1) % order.length]
    setSettings({ ...settings, appearance })
    setSettings(await api.settings.set({ appearance }))
  }
  const ModeIcon = settings?.appearance === 'light' ? Sun : settings?.appearance === 'system' ? Monitor : Moon

  return (
    <aside className="row-start-1 flex min-h-0 flex-col">
      <div className={cx('drag flex h-14 items-center gap-2.5 pt-2', collapsed ? 'justify-center px-0' : 'px-5')}>
        <LogoMark size={26} />
        {!collapsed && (
          <span className="text-[17px] font-bold tracking-tight">
            Song<span className="forge-text">Forge</span>
          </span>
        )}
      </div>

      {/* Forge: the main place to be, so it's a glowing molten button set apart from the menu */}
      <div className={cx('mt-3', collapsed ? 'flex justify-center px-2' : 'px-3')}>
        <button
          data-tour="nav-forge"
          onClick={() => navigate({ name: 'forge' })}
          title={collapsed ? 'Forge (Ctrl+N)' : 'Make a new song (Ctrl+N)'}
          aria-current={forgeActive ? 'page' : undefined}
          className={cx(
            'forge-gradient group relative flex items-center font-semibold text-on-accent transition duration-200 hover:brightness-110 active:scale-[0.98]',
            'shadow-[0_6px_22px_-6px_color-mix(in_oklab,var(--color-ember-500)_75%,transparent),inset_0_1px_0_rgb(255_255_255/0.35)]',
            collapsed ? 'size-11 justify-center rounded-xl' : 'h-11 w-full gap-3 rounded-xl px-3.5 text-[15px]',
            forgeActive && 'ring-2 ring-ember-400/50 ring-offset-2 ring-offset-ink-950'
          )}
        >
          <Anvil size={collapsed ? 22 : 20} />
          {!collapsed && <span className="flex-1 text-left">Forge</span>}
          {!collapsed &&
            (queueBusy ? (
              <span className="rounded-md bg-black/20 px-1.5 py-0.5 text-[11px] font-bold" title={`${queueBusy} downloading`}>
                {queueBusy} ⟳
              </span>
            ) : (
              <span className="rounded-md bg-black/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide">Ctrl N</span>
            ))}
          {collapsed && !!queueBusy && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-ink-950 bg-ink-100" />}
        </button>
      </div>
      <div className={cx('my-3 h-px bg-ink-800', collapsed ? 'mx-auto w-6' : 'mx-5')} />

      <nav className={cx('flex flex-col gap-0.5', collapsed ? 'items-center px-2' : 'px-3')}>
        {nav.map(({ r, label, icon: Icon, badge }) => (
          <button
            key={label}
            data-tour={`nav-${r.name}`}
            onClick={() => navigate(r)}
            title={collapsed ? label : undefined}
            className={cx(
              'group relative flex h-10 items-center rounded-lg text-sm font-medium transition',
              collapsed ? 'w-10 justify-center' : 'gap-3 px-3',
              isActive(r) ? 'bg-ink-800 text-ink-100' : 'text-ink-300 hover:bg-ink-850 hover:text-ink-100'
            )}
          >
            <Icon size={18} className={cx(isActive(r) ? 'text-ember-400' : 'text-ink-400 group-hover:text-ink-200')} />
            {!collapsed && <span className="flex-1 text-left">{label}</span>}
            {!!badge &&
              (collapsed ? (
                <span className="absolute right-1 top-1 size-2 rounded-full bg-ember-500" />
              ) : (
                <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[11px] text-ink-300">{badge}</span>
              ))}
          </button>
        ))}
      </nav>

      {!collapsed ? (
        <>
          <div className="mt-6 flex items-center justify-between px-6">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Playlists</span>
            <button onClick={() => setCreating(true)} className="rounded-md p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100" aria-label="New playlist" title="New playlist">
              <Plus size={16} />
            </button>
          </div>
          <div className="mt-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
            {creating && (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={create}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') create()
                  if (e.key === 'Escape') {
                    setCreating(false)
                    setName('')
                  }
                }}
                placeholder="Playlist name"
                className="h-9 rounded-lg border border-ember-500/60 bg-ink-850 px-3 text-sm outline-none"
              />
            )}
            {library.playlists.map((p) => {
              const active = route.name === 'playlist' && route.id === p.id
              const playingHere = current && p.songIds.includes(current.id)
              return (
                <button
                  key={p.id}
                  onClick={() => navigate({ name: 'playlist', id: p.id })}
                  className={cx('flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition', active ? 'bg-ink-800 text-ink-100' : 'text-ink-300 hover:bg-ink-850 hover:text-ink-100')}
                >
                  <ListMusic size={16} className="shrink-0 text-ink-400" />
                  <span className="flex-1 truncate text-left">{p.name}</span>
                  {playingHere && playing ? <EqIcon /> : <span className="text-[11px] text-ink-400">{p.songIds.length}</span>}
                </button>
              )
            })}
            {!library.playlists.length && !creating && (
              <p className="px-3 py-2 text-xs leading-relaxed text-ink-400">Group your forged songs into playlists and export them as .m3u.</p>
            )}
          </div>
        </>
      ) : (
        // Rail mode: playlists as compact tiles so they're still one click away
        <div className="mt-4 flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-2 pb-3">
          <div className="mb-1 h-px w-6 bg-ink-700" />
          {library.playlists.map((p) => {
            const active = route.name === 'playlist' && route.id === p.id
            return (
              <button
                key={p.id}
                onClick={() => navigate({ name: 'playlist', id: p.id })}
                title={p.name}
                className={cx(
                  'flex size-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold uppercase transition',
                  active ? 'bg-ink-800 text-ember-400' : 'text-ink-400 hover:bg-ink-850 hover:text-ink-100'
                )}
              >
                {p.name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2) || <ListMusic size={16} />}
              </button>
            )
          })}
          <button
            onClick={async () => {
              const id = await api.playlist.create(`New Playlist ${library.playlists.length + 1}`)
              await refresh()
              navigate({ name: 'playlist', id })
            }}
            title="New playlist"
            aria-label="New playlist"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-850 hover:text-ink-100"
          >
            <Plus size={16} />
          </button>
        </div>
      )}

      <div className={cx('flex pb-3', collapsed ? 'justify-center' : 'px-3')}>
        <button
          onClick={cycleAppearance}
          title={`Appearance: ${settings?.appearance ?? 'dark'} (click to change)`}
          className={cx(
            'flex h-9 items-center rounded-lg text-xs text-ink-400 transition hover:bg-ink-850 hover:text-ink-100',
            collapsed ? 'w-10 justify-center' : 'gap-2.5 px-3'
          )}
        >
          <ModeIcon size={16} />
          {!collapsed && <span className="capitalize">{settings?.appearance ?? 'dark'} mode</span>}
        </button>
      </div>
    </aside>
  )
}
