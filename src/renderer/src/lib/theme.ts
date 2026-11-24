/**
 * Runtime theming. Every color in the UI comes from CSS variables declared in styles.css
 * (`--color-ink-*` for surfaces/text, `--color-ember-*`/`--color-gold-400` for the accent).
 * A theme is just a set of overrides for those variables, applied on :root (or any element).
 */
import type { Appearance, Settings } from '@shared/types'
import { api } from './api'

const STEPS = ['950', '900', '850', '800', '700', '600', '500', '400', '300', '200', '100'] as const
type Scale = Record<(typeof STEPS)[number], string>

export interface Palette {
  id: string
  name: string
  mode: 'dark' | 'light'
  ink: Scale
}

const scale = (v: string[]): Scale => Object.fromEntries(STEPS.map((s, i) => [s, v[i]])) as Scale

export const PALETTES: Palette[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    mode: 'dark',
    ink: scale(['#08080b', '#0d0d11', '#121218', '#17171f', '#20202a', '#2b2b37', '#3a3a48', '#6b6b7b', '#9c9cab', '#c9c9d4', '#ececf2'])
  },
  {
    id: 'graphite',
    name: 'Graphite',
    mode: 'dark',
    ink: scale(['#0a0a0a', '#111111', '#161616', '#1c1c1c', '#262626', '#323232', '#444444', '#737373', '#a3a3a3', '#d4d4d4', '#f5f5f5'])
  },
  {
    id: 'plum',
    name: 'Plum',
    mode: 'dark',
    ink: scale(['#0c0810', '#130d18', '#19111f', '#1f1627', '#2a1e35', '#372844', '#4a3759', '#7a6a88', '#a898b5', '#d3c8dc', '#f3eef7'])
  },
  {
    id: 'forest',
    name: 'Forest',
    mode: 'dark',
    ink: scale(['#070b09', '#0c120f', '#111814', '#161f1a', '#1f2a24', '#2a372f', '#3a4a40', '#6a7d71', '#9cb0a3', '#ccd9d0', '#eef4f0'])
  },
  {
    id: 'ocean',
    name: 'Deep Sea',
    mode: 'dark',
    ink: scale(['#060a12', '#0b111c', '#101724', '#151e2e', '#1d283b', '#28354b', '#384861', '#66758e', '#98a5bb', '#c9d2e0', '#eef2f8'])
  },
  {
    id: 'oled',
    name: 'OLED Black',
    mode: 'dark',
    ink: scale(['#000000', '#000000', '#0a0a0a', '#121212', '#1b1b1b', '#262626', '#3a3a3a', '#6e6e6e', '#a0a0a0', '#d0d0d0', '#ffffff'])
  },
  {
    id: 'daylight',
    name: 'Daylight',
    mode: 'light',
    ink: scale(['#eeeef2', '#f8f8fa', '#ffffff', '#f0f0f4', '#e4e4ea', '#d4d4dd', '#b2b2bf', '#787886', '#52525e', '#30303a', '#121217'])
  },
  {
    id: 'paper',
    name: 'Paper',
    mode: 'light',
    ink: scale(['#ede7dd', '#f7f3ec', '#fffdf8', '#f1ebe1', '#e5ddd0', '#d5cbbb', '#b3a795', '#827768', '#5a5145', '#38312a', '#1c1814'])
  },
  {
    id: 'mist',
    name: 'Mist',
    mode: 'light',
    ink: scale(['#e8edf3', '#f4f7fa', '#ffffff', '#eaeff5', '#dde4ec', '#cbd4df', '#a8b3c2', '#6f7b8c', '#4a5566', '#2b3442', '#111722'])
  }
]

export interface AccentPreset {
  id: string
  name: string
  from: string
  to: string
}

export const ACCENTS: AccentPreset[] = [
  { id: 'ember', name: 'Ember', from: '#ff6a3d', to: '#ffc15c' },
  { id: 'rose', name: 'Rose', from: '#ff4d79', to: '#ffa3c7' },
  { id: 'violet', name: 'Violet', from: '#8b5cf6', to: '#e08bff' },
  { id: 'ocean', name: 'Ocean', from: '#2f80ff', to: '#4fe0ff' },
  { id: 'mint', name: 'Mint', from: '#10c98f', to: '#b4f27a' },
  { id: 'gold', name: 'Gold', from: '#f0a500', to: '#ffe27a' },
  { id: 'crimson', name: 'Crimson', from: '#e5243b', to: '#ff7a59' },
  { id: 'spotify', name: 'Green', from: '#1db954', to: '#7ee8a6' }
]

// ---------- color math ----------
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}
function luminance(hex: string): number {
  const c = hexToRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
/** Derive a gradient partner for a custom accent: lighter and hue-nudged toward warm. */
function partnerFor(hex: string): string {
  return mix(hex, '#ffe08a', 0.45)
}

export interface ResolvedTheme {
  palette: Palette
  accent: AccentPreset
  vars: Record<string, string>
}

export function resolveTheme(s: Pick<Settings, 'appearance' | 'darkTheme' | 'lightTheme' | 'accent' | 'customAccent'>, systemDark: boolean): ResolvedTheme {
  const mode: 'dark' | 'light' = s.appearance === 'system' ? (systemDark ? 'dark' : 'light') : s.appearance
  const wanted = mode === 'dark' ? s.darkTheme : s.lightTheme
  const palette = PALETTES.find((p) => p.id === wanted && p.mode === mode) ?? PALETTES.find((p) => p.mode === mode)!
  const accent =
    s.accent === 'custom'
      ? { id: 'custom', name: 'Custom', from: s.customAccent, to: partnerFor(s.customAccent) }
      : (ACCENTS.find((a) => a.id === s.accent) ?? ACCENTS[0])
  return { palette, accent, vars: paletteVars(palette, accent) }
}

export function paletteVars(palette: Palette, accent: AccentPreset): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const step of STEPS) vars[`--color-ink-${step}`] = palette.ink[step]
  const light = palette.mode === 'light'
  const a = accent.from
  // Accent text (300/400) must stay readable: lighten on dark themes, darken on light ones.
  vars['--color-ember-300'] = light ? mix(a, '#000000', 0.3) : mix(a, '#ffffff', 0.45)
  vars['--color-ember-400'] = light ? mix(a, '#000000', 0.15) : mix(a, '#ffffff', 0.2)
  vars['--color-ember-500'] = a
  vars['--color-ember-600'] = mix(a, '#000000', 0.15)
  vars['--color-gold-400'] = accent.to
  const mid = mix(accent.from, accent.to, 0.5)
  vars['--color-on-accent'] = luminance(mid) > 0.38 ? '#0b0b0e' : '#ffffff'
  return vars
}

export function applyVars(el: HTMLElement, vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v)
}

const CACHE_KEY = 'sf-theme-vars'

export function applyTheme(t: ResolvedTheme) {
  const root = document.documentElement
  applyVars(root, t.vars)
  root.dataset.mode = t.palette.mode
  root.style.colorScheme = t.palette.mode
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ vars: t.vars, mode: t.palette.mode }))
  } catch {
    /* ignore */
  }
  api.window.setTheme(t.palette.ink['950'], t.palette.ink['300']).catch(() => {})
  window.dispatchEvent(new CustomEvent('sf-theme'))
}

/** Apply the last-used theme synchronously at startup to avoid a flash of the default palette. */
export function applyCachedTheme() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { vars: Record<string, string>; mode: string } | null
    if (!c) return
    applyVars(document.documentElement, c.vars)
    document.documentElement.dataset.mode = c.mode
    document.documentElement.style.colorScheme = c.mode
  } catch {
    /* ignore */
  }
}

export const systemDarkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

/** Read a CSS variable's current value (for canvas-based drawing like the waveform). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export type { Appearance }
