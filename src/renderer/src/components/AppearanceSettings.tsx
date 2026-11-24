import { useEffect, useState } from 'react'
import { Check, Monitor, Moon, Pipette, Sun } from 'lucide-react'
import type { Appearance, Settings } from '@shared/types'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { ACCENTS, PALETTES, type Palette, resolveTheme, systemDarkQuery } from '@/lib/theme'
import { Segmented, cx } from './ui'

export function AppearanceSettings() {
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const [hex, setHex] = useState(settings?.customAccent ?? '#ff6a3d')
  useEffect(() => setHex(settings?.customAccent ?? '#ff6a3d'), [settings?.customAccent])
  if (!settings) return null

  const save = async (patch: Partial<Settings>) => {
    setSettings({ ...settings, ...patch }) // optimistic, so the UI recolors instantly
    setSettings(await api.settings.set(patch))
  }
  const active = resolveTheme(settings, systemDarkQuery().matches)

  const pickPalette = (p: Palette) => {
    const patch: Partial<Settings> = p.mode === 'dark' ? { darkTheme: p.id } : { lightTheme: p.id }
    if (settings.appearance !== 'system') patch.appearance = p.mode
    save(patch)
  }

  const commitHex = (v: string) => {
    if (/^#[0-9a-f]{6}$/i.test(v)) save({ accent: 'custom', customAccent: v.toLowerCase() })
    else setHex(settings.customAccent)
  }

  return (
    <div className="flex flex-col gap-6 py-5">
      <div className="flex items-center justify-between gap-6">
        <div>
          <div className="text-sm font-medium">Mode</div>
          <div className="mt-0.5 text-xs text-ink-400">System follows your Windows light/dark setting.</div>
        </div>
        <Segmented<Appearance>
          value={settings.appearance}
          onChange={(appearance) => save({ appearance })}
          options={[
            { value: 'system', label: 'System', icon: <Monitor size={13} /> },
            { value: 'dark', label: 'Dark', icon: <Moon size={13} /> },
            { value: 'light', label: 'Light', icon: <Sun size={13} /> }
          ]}
        />
      </div>

      <div>
        <div className="mb-3 text-sm font-medium">Theme</div>
        {(['dark', 'light'] as const).map((mode) => (
          <div key={mode} className="mb-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{mode === 'dark' ? 'Dark themes' : 'Light themes'}</div>
            <div className="grid grid-cols-3 gap-3">
              {PALETTES.filter((p) => p.mode === mode).map((p) => {
                const selected = (mode === 'dark' ? settings.darkTheme : settings.lightTheme) === p.id
                const live = active.palette.id === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => pickPalette(p)}
                    className={cx(
                      'group overflow-hidden rounded-xl border text-left transition',
                      selected ? 'border-ember-500 ring-2 ring-ember-500/30' : 'border-ink-600 hover:border-ink-500'
                    )}
                  >
                    <ThemePreview palette={p} accentFrom={active.accent.from} accentTo={active.accent.to} />
                    <div className="flex items-center justify-between bg-ink-800 px-3 py-2">
                      <span className="text-[13px] font-medium">{p.name}</span>
                      {selected && (
                        <span className={cx('flex items-center gap-1 text-[11px]', live ? 'text-ember-400' : 'text-ink-400')}>
                          <Check size={12} /> {live ? 'Active' : 'Selected'}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-3 text-sm font-medium">Accent color</div>
        <div className="flex flex-wrap items-center gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => save({ accent: a.id })}
              title={a.name}
              aria-label={`${a.name} accent`}
              className={cx(
                'relative size-10 rounded-full transition hover:scale-110',
                settings.accent === a.id && 'ring-2 ring-ink-100 ring-offset-2 ring-offset-ink-850'
              )}
              style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
            >
              {settings.accent === a.id && <Check size={16} className="absolute inset-0 m-auto text-white drop-shadow" />}
            </button>
          ))}
          <div className="mx-1 h-8 w-px bg-ink-600" />
          <label
            className={cx(
              'relative flex size-10 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-ink-500 transition hover:scale-110',
              settings.accent === 'custom' && 'ring-2 ring-ink-100 ring-offset-2 ring-offset-ink-850 border-transparent'
            )}
            style={settings.accent === 'custom' ? { background: `linear-gradient(135deg, ${active.accent.from}, ${active.accent.to})` } : undefined}
            title="Custom color"
          >
            <Pipette size={15} className={settings.accent === 'custom' ? 'text-white drop-shadow' : 'text-ink-300'} />
            <input
              type="color"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              onBlur={(e) => commitHex(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Pick a custom accent color"
            />
          </label>
          <input
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            onBlur={() => commitHex(hex)}
            onKeyDown={(e) => e.key === 'Enter' && commitHex(hex)}
            className="h-9 w-24 rounded-lg border border-ink-600 bg-ink-800 px-2 font-mono text-xs uppercase outline-none focus:border-ember-500/60"
            aria-label="Custom accent hex"
          />
        </div>
      </div>
    </div>
  )
}

/** A tiny mock of the app window, drawn with the palette's own colors. */
function ThemePreview({ palette, accentFrom, accentTo }: { palette: Palette; accentFrom: string; accentTo: string }) {
  const c = palette.ink
  return (
    <div className="flex h-24 gap-1.5 p-2" style={{ background: c['950'] }}>
      <div className="flex w-1/4 flex-col gap-1 pt-1">
        <div className="h-2 w-3/4 rounded-full" style={{ background: `linear-gradient(90deg, ${accentFrom}, ${accentTo})` }} />
        <div className="mt-1 h-1.5 w-full rounded-full" style={{ background: c['700'] }} />
        <div className="h-1.5 w-2/3 rounded-full" style={{ background: c['700'] }} />
        <div className="h-1.5 w-4/5 rounded-full" style={{ background: c['700'] }} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 rounded-md p-2" style={{ background: c['900'], border: `1px solid ${c['800']}` }}>
        <div className="h-2 w-1/2 rounded-full" style={{ background: c['100'] }} />
        <div className="h-1.5 w-3/4 rounded-full" style={{ background: c['400'] }} />
        <div className="mt-auto flex items-end gap-[2px]">
          {[5, 9, 6, 12, 8, 14, 7, 10, 5, 11, 6, 9].map((h, i) => (
            <div key={i} className="w-1 rounded-sm" style={{ height: h * 1.6, background: i < 5 ? accentFrom : c['500'] }} />
          ))}
          <div className="ml-auto h-4 w-9 rounded-full" style={{ background: `linear-gradient(135deg, ${accentFrom}, ${accentTo})` }} />
        </div>
      </div>
    </div>
  )
}
