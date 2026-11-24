import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronsLeft, ChevronRight, ChevronsRight, Crosshair, Magnet, Play } from 'lucide-react'
import { fmtTime, parseTime } from '@/lib/format'
import { cssVar } from '@/lib/theme'
import { IconButton, cx } from '../ui'

interface Props {
  label: string
  edge: 'start' | 'end'
  value: number
  other: number // the opposite edge (start for 'end', end for 'start')
  duration: number
  playhead: number
  peaks: number[]
  perSecond: number
  color: string
  onChange: (t: number, group?: string) => void
  onSnap: () => void
  onToPlayhead: () => void
  onPreview: () => void
}

const WINDOW = 5 // seconds shown around the edge

/** A magnified waveform around one clip edge. Drag or click to place the edge precisely. */
export function EdgeZoom({ label, edge, value, other, duration, playhead, peaks, perSecond, color, onChange, onSnap, onToPlayhead, onPreview }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null)
  const [text, setText] = useState(fmtTime(value, true))
  const [theme, setTheme] = useState(0)
  useEffect(() => setText(fmtTime(value, true)), [value])
  useEffect(() => {
    const h = () => setTheme((t) => t + 1)
    window.addEventListener('sf-theme', h)
    return () => window.removeEventListener('sf-theme', h)
  }, [])

  const from = value - WINDOW / 2
  const clamp = (t: number) => (edge === 'start' ? Math.max(0, Math.min(t, other - 0.5)) : Math.min(duration, Math.max(t, other + 0.5)))

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const w = c.clientWidth
    const h = c.clientHeight
    const dpr = window.devicePixelRatio || 1
    c.width = w * dpr
    c.height = h * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)
    const inside = cssVar('--color-ink-200')
    const outside = cssVar('--color-ink-500')
    const pxPerSec = w / WINDOW
    // Shade the part of the window that's outside the clip
    const edgeX = w / 2
    ctx.fillStyle = document.documentElement.dataset.mode === 'light' ? 'rgba(0,0,0,0.07)' : 'rgba(0,0,0,0.25)'
    if (edge === 'start') ctx.fillRect(0, 0, edgeX, h)
    else ctx.fillRect(edgeX, 0, w - edgeX, h)
    // Bars
    const barW = 2
    for (let x = 0; x < w; x += barW + 1) {
      const t = from + x / pxPerSec
      if (t < 0 || t > duration) continue
      const i = Math.floor(t * perSecond)
      const p = peaks[i] ?? 0
      const bh = Math.max(1, p * (h - 6))
      const inClip = edge === 'start' ? x >= edgeX : x <= edgeX
      ctx.fillStyle = inClip ? inside : outside
      ctx.globalAlpha = inClip ? 0.9 : 0.6
      ctx.fillRect(x, (h - bh) / 2, barW, bh)
    }
    ctx.globalAlpha = 1
    // Playhead
    if (playhead >= from && playhead <= from + WINDOW) {
      ctx.fillStyle = cssVar('--color-ember-400')
      ctx.fillRect((playhead - from) * pxPerSec - 1, 0, 2, h)
    }
    // Edge line
    ctx.fillStyle = color
    ctx.fillRect(edgeX - 1.5, 0, 3, h)
    ctx.beginPath()
    ctx.moveTo(edgeX - 6, 0)
    ctx.lineTo(edgeX + 6, 0)
    ctx.lineTo(edgeX, 7)
    ctx.fill()
  }, [value, playhead, peaks, perSecond, duration, color, edge, from, theme])

  const secPerPx = () => WINDOW / (wrapRef.current?.clientWidth || 300)

  const commitText = () => {
    const t = parseTime(text)
    if (t != null) onChange(clamp(t))
    else setText(fmtTime(value, true))
  }
  const nudge = (d: number) => onChange(clamp(value + d), `${edge}-nudge`)

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-800/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{label}</span>
        <div className="flex items-center gap-0.5">
          <IconButton label={`Snap ${edge} to the nearest quiet spot`} size="sm" onClick={onSnap}>
            <Magnet size={13} />
          </IconButton>
          <IconButton label={`Set ${edge} to playhead`} size="sm" onClick={onToPlayhead}>
            <Crosshair size={13} />
          </IconButton>
          <IconButton label={edge === 'start' ? 'Preview the first 3 seconds' : 'Preview the last 3 seconds'} size="sm" onClick={onPreview}>
            <Play size={12} fill="currentColor" />
          </IconButton>
        </div>
      </div>
      <div
        ref={wrapRef}
        className="relative h-14 cursor-ew-resize touch-none overflow-hidden rounded-lg bg-ink-950/60"
        onPointerDown={(e) => {
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, v: value, moved: false }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const dx = e.clientX - drag.current.x
          if (Math.abs(dx) > 2) drag.current.moved = true
          // Dragging moves the waveform under a fixed edge line, like a jog wheel
          if (drag.current.moved) onChange(clamp(drag.current.v - dx * secPerPx() * (e.shiftKey ? 0.2 : 1)), `${edge}-jog`)
        }}
        onPointerUp={(e) => {
          if (drag.current && !drag.current.moved) {
            const rect = wrapRef.current!.getBoundingClientRect()
            onChange(clamp(from + (e.clientX - rect.left) * secPerPx()))
          }
          drag.current = null
        }}
        title="Drag to fine-tune (hold Shift for extra precision), or click to place the edge"
      >
        <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      </div>
      <div className="mt-2 flex items-center gap-0.5">
        <IconButton label="−0.1s" size="sm" onClick={() => nudge(-0.1)}>
          <ChevronsLeft size={14} />
        </IconButton>
        <IconButton label="−0.01s" size="sm" onClick={() => nudge(-0.01)}>
          <ChevronLeft size={14} />
        </IconButton>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              nudge((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 0.1 : 0.01))
            }
          }}
          className={cx('h-8 min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-850 px-1 text-center font-mono text-[13px] outline-none focus:border-ember-500/60')}
          aria-label={`${label} time`}
          title="Type a time, or use ↑/↓ to nudge (Shift for 0.1s)"
        />
        <IconButton label="+0.01s" size="sm" onClick={() => nudge(0.01)}>
          <ChevronRight size={14} />
        </IconButton>
        <IconButton label="+0.1s" size="sm" onClick={() => nudge(0.1)}>
          <ChevronsRight size={14} />
        </IconButton>
      </div>
    </div>
  )
}
