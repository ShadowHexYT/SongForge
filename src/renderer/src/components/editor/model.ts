import { CLIP_DEFAULTS, FX_DEFAULTS, type ClipSettings, type FxPreset, type FxSettings, type Marker, type SongMeta } from '@shared/types'
import type { CoverState } from '../CoverCropper'

/** Editable content of one clip. Everything here participates in undo/redo. */
export interface Draft {
  key: string
  color: string
  meta: SongMeta
  clip: ClipSettings
  cover: CoverState
}

export interface EditorState {
  drafts: Draft[]
  markers: Marker[]
}

/** Runtime (non-undoable) state per clip. */
export interface ForgeStatus {
  status: 'idle' | 'working' | 'error'
  progress: number
  stage: string
  error?: string
}

export interface Forged {
  songId: string
  hash: string
}

let seq = 0
export const newKey = (prefix = 'clip') => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`

export function normalizeClip(c: Partial<ClipSettings> & Pick<ClipSettings, 'start' | 'end'>): ClipSettings {
  return { fadeIn: 0, fadeOut: 0, normalize: true, cleanup: 'none', ...CLIP_DEFAULTS, ...c, fx: { ...FX_DEFAULTS, ...c.fx } } as ClipSettings
}

/** Content hash used to know whether a clip changed since it was last forged. */
export function draftHash(d: Draft): string {
  const c = d.cover
  const coverSig = `${c.kind}|${c.src.length}|${c.src.slice(-48)}|${c.panX.toFixed(3)}|${c.panY.toFixed(3)}|${c.zoom.toFixed(3)}`
  return JSON.stringify([d.meta, d.clip, coverSig])
}

/** Find the quietest moment near `t` (within ±radius s), using the waveform peaks. */
export function snapToQuiet(peaks: number[], perSecond: number, t: number, radius = 0.35): number {
  const center = Math.round(t * perSecond)
  const r = Math.max(1, Math.round(radius * perSecond))
  let best = center
  let bestE = Infinity
  for (let i = Math.max(1, center - r); i <= Math.min(peaks.length - 2, center + r); i++) {
    // Smooth over 3 bins and lightly prefer staying close to the original point
    const e = peaks[i - 1] + peaks[i] * 2 + peaks[i + 1] + (Math.abs(i - center) / r) * 0.08
    if (e < bestE) {
      bestE = e
      best = i
    }
  }
  return best / perSecond
}

export const SPEED_PRESETS: Array<{ id: string; label: string; speed: number; pitch: number; hint: string }> = [
  { id: 'normal', label: 'Original', speed: 1, pitch: 0, hint: 'No change' },
  { id: 'sped', label: 'Sped up', speed: 1.25, pitch: 2, hint: '1.25× · +2 st' },
  { id: 'nightcore', label: 'Nightcore', speed: 1.3, pitch: 4, hint: '1.3× · +4 st' },
  { id: 'slowed', label: 'Slowed', speed: 0.85, pitch: -2, hint: '0.85× · −2 st' },
  { id: 'dreamy', label: 'Dreamy', speed: 0.9, pitch: -1, hint: '0.9× · −1 st' }
]

const fx = (p: Partial<FxSettings>): FxSettings => ({ ...FX_DEFAULTS, ...p })

/** Built-in tone/space presets. Users can save up to 5 of their own next to these. */
export const FX_PRESETS: FxPreset[] = [
  { id: 'none', name: 'Clean', fx: fx({}) },
  { id: 'slowed-reverb', name: 'Slowed + reverb', fx: fx({ reverb: 0.45, room: 0.75, treble: -3, bass: 2 }), speed: 0.85, pitch: -2 },
  { id: 'vocal-clarity', name: 'Vocal clarity', fx: fx({ bass: -2, mid: 3, treble: 2 }) },
  { id: 'bass-boost', name: 'Bass boost', fx: fx({ bass: 6, treble: 1 }) },
  { id: 'concert-hall', name: 'Concert hall', fx: fx({ reverb: 0.35, room: 0.9 }) },
  { id: 'warm', name: 'Warm', fx: fx({ bass: 2, mid: -1, treble: -3, reverb: 0.12, room: 0.3 }) }
]

export const fxEqual = (a: FxSettings, b: FxSettings) =>
  (['bass', 'mid', 'treble', 'reverb'] as const).every((k) => Math.abs(a[k] - b[k]) < 0.001) && (a.reverb === 0 || Math.abs(a.room - b.room) < 0.001)

export const fxActive = (f: FxSettings) => f.bass !== 0 || f.mid !== 0 || f.treble !== 0 || f.reverb > 0
