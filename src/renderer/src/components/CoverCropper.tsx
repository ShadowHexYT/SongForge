import { useEffect, useRef, useState } from 'react'
import { Camera, Image as ImageIcon, Upload, MonitorPlay, ZoomIn } from 'lucide-react'
import { api, mediaUrl } from '@/lib/api'
import { Button, Range, cx } from './ui'

export interface CoverState {
  kind: 'thumb' | 'frame' | 'upload' | 'existing' | 'none'
  /** URL that can be drawn on a canvas (sf-media:// or data:) */
  src: string
  /** Original path on disk for 'existing' covers, so unchanged covers aren't re-encoded */
  path?: string
  panX: number
  panY: number
  zoom: number
}

export const emptyCover: CoverState = { kind: 'none', src: '', panX: 0.5, panY: 0.5, zoom: 1 }

const imageCache = new Map<string, Promise<HTMLImageElement>>()
function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
    imageCache.set(src, p)
  }
  return p
}

function drawCrop(ctx: CanvasRenderingContext2D, img: HTMLImageElement, c: CoverState, size: number) {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const s = Math.min(w, h) / c.zoom
  const sx = (w - s) * c.panX
  const sy = (h - s) * c.panY
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size)
}

/** Render the final square cover as a JPEG data URL (or the untouched path for existing covers). */
export async function renderCover(c: CoverState): Promise<string | null> {
  if (c.kind === 'none' || !c.src) return null
  if (c.kind === 'existing' && c.path && c.zoom === 1 && c.panX === 0.5 && c.panY === 0.5) return c.path
  const img = await loadImage(c.src)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1000
  drawCrop(canvas.getContext('2d')!, img, c, 1000)
  return canvas.toDataURL('image/jpeg', 0.92)
}

/** Grab the current frame of a <video> element as a JPEG data URL. */
export function grabFrame(video: HTMLVideoElement): string | null {
  if (!video.videoWidth) return null
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')!.drawImage(video, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.92)
}

interface Props {
  value: CoverState
  onChange: (c: CoverState) => void
  thumbnailPath?: string | null
  video?: HTMLVideoElement | null
  size?: number
}

export function CoverCropper({ value, onChange, thumbnailPath, video, size = 232 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!value.src) return setImg(null)
    let alive = true
    loadImage(value.src).then((i) => alive && setImg(i), () => alive && setImg(null))
    return () => {
      alive = false
    }
  }, [value.src])

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, size * 2, size * 2)
    if (img) drawCrop(ctx, img, value, size * 2)
  }, [img, value, size])

  const set = (patch: Partial<CoverState>) => onChange({ ...value, ...patch })

  const onPointerDown = (e: React.PointerEvent) => {
    if (!img) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, panX: value.panX, panY: value.panY }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !img) return
    const s = Math.min(img.naturalWidth, img.naturalHeight) / value.zoom
    const scale = s / size // source px per screen px
    const slackX = img.naturalWidth - s
    const slackY = img.naturalHeight - s
    const dx = (e.clientX - drag.current.x) * scale
    const dy = (e.clientY - drag.current.y) * scale
    set({
      panX: slackX > 0 ? Math.min(1, Math.max(0, drag.current.panX - dx / slackX)) : 0.5,
      panY: slackY > 0 ? Math.min(1, Math.max(0, drag.current.panY - dy / slackY)) : 0.5
    })
  }

  const fromThumb = () => thumbnailPath && onChange({ kind: 'thumb', src: mediaUrl(thumbnailPath), panX: 0.5, panY: 0.5, zoom: 1 })
  const fromFrame = () => {
    if (!video) return
    const d = grabFrame(video)
    if (d) onChange({ kind: 'frame', src: d, panX: 0.5, panY: 0.5, zoom: 1 })
  }
  const fromUpload = async () => {
    const p = await api.dialog.pickImage()
    if (p) onChange({ kind: 'upload', src: mediaUrl(p), panX: 0.5, panY: 0.5, zoom: 1 })
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cx('relative overflow-hidden rounded-xl border border-ink-600 bg-ink-800', img ? 'cursor-grab active:cursor-grabbing' : '')}
        style={{ width: size, height: size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f && f.type.startsWith('image/')) onChange({ kind: 'upload', src: mediaUrl(api.filePathFor(f)), panX: 0.5, panY: 0.5, zoom: 1 })
        }}
      >
        <canvas ref={canvasRef} width={size * 2} height={size * 2} style={{ width: size, height: size }} />
        {!img && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-400">
            <ImageIcon size={28} />
            <span className="text-xs">No cover. Drop an image here</span>
          </div>
        )}
        {img && <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80">Drag to reposition</div>}
      </div>
      <div className="flex items-center gap-2" style={{ width: size }}>
        <ZoomIn size={14} className="shrink-0 text-ink-400" />
        <Range label="Cover zoom" value={value.zoom} min={1} max={3} onChange={(zoom) => set({ zoom })} />
      </div>
      <div className="flex flex-wrap gap-1.5" style={{ width: size }}>
        <Button size="sm" variant={value.kind === 'thumb' ? 'primary' : 'secondary'} onClick={fromThumb} disabled={!thumbnailPath} icon={<MonitorPlay size={14} />}>
          Thumbnail
        </Button>
        <Button size="sm" variant={value.kind === 'frame' ? 'primary' : 'secondary'} onClick={fromFrame} disabled={!video} icon={<Camera size={14} />} title="Use the current video frame">
          Frame
        </Button>
        <Button size="sm" variant={value.kind === 'upload' ? 'primary' : 'secondary'} onClick={fromUpload} icon={<Upload size={14} />}>
          Upload
        </Button>
      </div>
    </div>
  )
}
