import { useEffect, useRef, useState, type ReactNode } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, { type Region } from 'wavesurfer.js/plugins/regions'
import TimelinePlugin from 'wavesurfer.js/plugins/timeline'
import MinimapPlugin from 'wavesurfer.js/plugins/minimap'
import type { Marker } from '@shared/types'
import { fmtTime } from '@/lib/format'
import { cssVar } from '@/lib/theme'

export interface WaveClip {
  key: string
  start: number
  end: number
  color: string
  label: string
  fadeIn: number // seconds of source time
  fadeOut: number
}

interface Props {
  media: HTMLMediaElement | null
  peaks: number[]
  duration: number
  clips: WaveClip[]
  markers: Marker[]
  selectedKey: string | null
  zoom: number
  height?: number
  onChange: (key: string, start: number, end: number, side?: 'start' | 'end') => void
  onSelect: (key: string) => void
  onCreate: (start: number, end: number) => void
  onMarkerMove: (id: string, time: number) => void
  /** Controls rendered to the right of the overview strip (e.g. zoom) */
  toolbar?: ReactNode
}

function alpha(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

function themeColors() {
  return {
    wave: cssVar('--color-ink-500'),
    progress: cssVar('--color-ink-300'),
    cursor: cssVar('--color-ember-400'),
    muted: cssVar('--color-ink-400'),
    overlay: alpha(cssVar('--color-ember-500') || '#ff6a3d', 0.18)
  }
}

/** Region content: label + fade-curve overlay drawn as SVG. */
function regionContent(label: string, c: WaveClip, selected: boolean): HTMLElement {
  const len = Math.max(0.001, c.end - c.start)
  const fi = Math.min(100, (c.fadeIn / len) * 100)
  const fo = Math.min(100, (c.fadeOut / len) * 100)
  const el = document.createElement('div')
  el.style.cssText = 'position:absolute;inset:0;pointer-events:none;padding:0;overflow:hidden;border-radius:6px'
  const stroke = selected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)'
  el.innerHTML = `
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">
      ${fi > 0 ? `<polygon points="0,0 ${fi},0 0,100" fill="rgba(0,0,0,0.3)"/><line x1="0" y1="100" x2="${fi}" y2="0" stroke="${stroke}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` : ''}
      ${fo > 0 ? `<polygon points="${100 - fo},0 100,0 100,100" fill="rgba(0,0,0,0.3)"/><line x1="${100 - fo}" y1="0" x2="100" y2="100" stroke="${stroke}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` : ''}
    </svg>
    <div style="position:absolute;left:8px;top:6px;font:600 11px var(--font-sans);color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.7);white-space:nowrap">${label.replace(/</g, '&lt;')}</div>`
  return el
}

export function Waveform(props: Props) {
  const { media, peaks, duration, clips, markers, selectedKey, zoom, height = 132 } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null)
  const contentSig = useRef(new Map<string, string>())
  const [ready, setReady] = useState(false)
  const handlers = useRef(props)
  handlers.current = props

  useEffect(() => {
    if (!media || !containerRef.current) return
    const col = themeColors()
    const regions = RegionsPlugin.create()
    const ws = WaveSurfer.create({
      container: containerRef.current,
      media,
      peaks: [Float32Array.from(peaks)],
      duration,
      height,
      waveColor: col.wave,
      progressColor: col.progress,
      cursorColor: col.cursor,
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      dragToSeek: true,
      autoScroll: true,
      autoCenter: false,
      hideScrollbar: true,
      plugins: [
        regions,
        TimelinePlugin.create({
          container: timelineRef.current!,
          height: 16,
          formatTimeCallback: (s) => fmtTime(s),
          style: { fontSize: '10px', color: col.muted, fontFamily: 'JetBrains Mono Variable, monospace' }
        }),
        MinimapPlugin.create({
          container: minimapRef.current!,
          height: 26,
          waveColor: col.wave,
          progressColor: col.progress,
          overlayColor: col.overlay,
          barWidth: 1,
          barGap: 1,
          cursorWidth: 0
        })
      ]
    })
    regions.enableDragSelection({ color: 'rgba(255,255,255,0.12)' })
    regions.on('region-created', (r: Region) => {
      if (r.id.startsWith('clip-') || r.id.startsWith('mark-')) return
      const { start, end } = r
      r.remove()
      if (end - start > 0.5) handlers.current.onCreate(start, end)
    })
    regions.on('region-updated', (r: Region, side?: 'start' | 'end') => {
      if (r.id.startsWith('mark-')) handlers.current.onMarkerMove(r.id, r.start)
      else handlers.current.onChange(r.id, r.start, r.end, side)
    })
    regions.on('region-clicked', (r: Region, e: MouseEvent) => {
      e.stopPropagation()
      if (r.id.startsWith('clip-')) handlers.current.onSelect(r.id)
      else if (r.id.startsWith('mark-')) media.currentTime = r.start
    })
    ws.on('ready', () => setReady(true))
    if (ws.getDuration() > 0) setReady(true)

    const onTheme = () => {
      const c = themeColors()
      ws.setOptions({ waveColor: c.wave, progressColor: c.progress, cursorColor: c.cursor })
    }
    window.addEventListener('sf-theme', onTheme)
    wsRef.current = ws
    regionsRef.current = regions
    const sig = contentSig.current
    return () => {
      window.removeEventListener('sf-theme', onTheme)
      setReady(false)
      sig.clear()
      ws.destroy()
      wsRef.current = null
      regionsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media])

  // Reconcile clip + marker regions with state
  useEffect(() => {
    const regions = regionsRef.current
    if (!regions || !ready) return
    const existing = new Map(regions.getRegions().map((r) => [r.id, r]))
    clips.forEach((c, i) => {
      const selected = c.key === selectedKey
      const color = alpha(c.color, selected ? 0.34 : 0.13)
      const label = `${i + 1}. ${c.label}`
      const sig = `${label}|${c.fadeIn.toFixed(2)}|${c.fadeOut.toFixed(2)}|${(c.end - c.start).toFixed(2)}|${selected}`
      let r = existing.get(c.key)
      if (!r) {
        r = regions.addRegion({ id: c.key, start: c.start, end: c.end, color, content: regionContent(label, c, selected), drag: true, resize: true, minLength: 0.5 })
        contentSig.current.set(c.key, sig)
      } else {
        const patch: Parameters<Region['setOptions']>[0] = { color }
        if (Math.abs(r.start - c.start) > 0.001) patch.start = c.start
        if (Math.abs(r.end - c.end) > 0.001) patch.end = c.end
        if (contentSig.current.get(c.key) !== sig) {
          patch.content = regionContent(label, c, selected)
          contentSig.current.set(c.key, sig)
        }
        r.setOptions(patch)
      }
      r.element?.style.setProperty('outline', selected ? `1.5px solid ${alpha(c.color, 0.95)}` : 'none')
      r.element?.style.setProperty('z-index', selected ? '4' : '2')
      existing.delete(c.key)
    })
    for (const m of markers) {
      const r = existing.get(m.id)
      if (!r) {
        const added = regions.addRegion({ id: m.id, start: m.time, color: 'rgba(250, 204, 21, 0.95)', content: m.label, drag: true })
        added.element?.style.setProperty('z-index', '6')
      } else {
        if (Math.abs(r.start - m.time) > 0.001) r.setOptions({ start: m.time })
        if (r.content?.textContent !== m.label) r.setOptions({ content: m.label })
      }
      existing.delete(m.id)
    }
    for (const r of existing.values()) {
      contentSig.current.delete(r.id)
      r.remove()
    }
  }, [clips, markers, selectedKey, ready])

  useEffect(() => {
    if (ready) wsRef.current?.setOptions({ height })
  }, [height, ready])

  useEffect(() => {
    if (!ready) return
    try {
      wsRef.current?.zoom(zoom)
    } catch {
      /* not ready */
    }
  }, [zoom, ready])

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-950/50">
      <div className="px-2 pt-2">
        <div id="waveform" ref={containerRef} />
        <div ref={timelineRef} />
      </div>
      <div className="flex items-center gap-3 border-t border-ink-700/70 px-2 py-1">
        <div ref={minimapRef} className="min-w-0 flex-1 opacity-80" title="Overview" />
        {props.toolbar}
      </div>
    </div>
  )
}
