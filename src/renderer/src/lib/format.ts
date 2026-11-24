export function fmtTime(sec: number, withMs = false): string {
  if (!isFinite(sec) || sec < 0) sec = 0
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.floor((sec % 1) * 100)
  const base = h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  return withMs ? `${base}.${String(ms).padStart(2, '0')}` : base
}

/** Parse "1:23", "1:23.45", "83.5" or "1:02:03" into seconds. */
export function parseTime(input: string): number | null {
  const t = input.trim()
  if (!t) return null
  const parts = t.split(':').map((p) => Number(p))
  if (parts.some((p) => !isFinite(p))) return null
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}

export function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} hr ${m % 60} min`
}

export function timeAgo(ts: number): string {
  const d = (Date.now() - ts) / 1000
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  if (d < 86400 * 30) return `${Math.floor(d / 86400)}d ago`
  return new Date(ts).toLocaleDateString()
}

export const CLIP_COLORS = ['#ff6a3d', '#38bdf8', '#a78bfa', '#4ade80', '#f472b6', '#facc15']
