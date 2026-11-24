import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { Button, Kbd, cx } from './ui'

export type TourId = 'app' | 'studio'

export interface TourStep {
  /** Matches an element's data-tour attribute. Leave out for a centered card. */
  target?: string
  title: string
  body: ReactNode
  /** Page to show for this step (app tour only) */
  route?: 'forge' | 'library' | 'spotify' | 'settings' | 'help'
}

export const TOURS: Record<TourId, { name: string; steps: TourStep[] }> = {
  app: {
    name: 'App tour',
    steps: [
      {
        route: 'forge',
        title: 'Welcome to SongForge 👋',
        body: 'This quick tour shows where everything is. Use the arrow keys or the buttons below, and press Esc to leave at any time.'
      },
      {
        route: 'forge',
        target: 'forge-input',
        title: 'Start here: paste or search',
        body: (
          <>
            Paste a link from YouTube, TikTok, SoundCloud and more, or type something like <i>“Chaewon live vocals”</i> to search YouTube. Paste several links at once to queue them all.
          </>
        )
      },
      {
        route: 'forge',
        target: 'forge-file',
        title: 'Or use a file from your PC',
        body: 'Open any audio or video file to clip it. You can also drag files onto this page.'
      },
      {
        target: 'nav-forge',
        route: 'forge',
        title: 'What happens next',
        body: 'Once a video is ready, the studio opens. That is where you mark the song, name it, add a cover and lyrics, and press Forge. The studio has its own short tour the first time you open it.'
      },
      {
        route: 'library',
        target: 'nav-library',
        title: 'Your library',
        body: 'Every song you forge lands here. Play, shuffle, make playlists, and edit details later. Versions of the same song (live, sped up, instrumental) stack together.'
      },
      {
        route: 'library',
        target: 'library-import',
        title: 'Bring your own songs',
        body: 'Import MP3s and other audio files you already have, so they play here alongside everything you forge.'
      },
      {
        target: 'player',
        title: 'The player',
        body: (
          <>
            Controls for whatever is playing. Click the cover to open <b>Now Playing</b>, with big artwork, synced lyrics and a version switcher. Space plays and pauses.
          </>
        )
      },
      {
        route: 'spotify',
        target: 'nav-spotify',
        title: 'Listen in Spotify',
        body: 'Every song is also an MP3 in your SongForge folder. This page walks you through adding that folder to Spotify on your PC, and getting the songs onto your phone.'
      },
      {
        route: 'settings',
        target: 'nav-settings',
        title: 'Make it yours',
        body: 'Themes and colors, your sound presets, the clipboard prompt, notifications, and the free AI add-on for vocals-only and instrumental exports.'
      },
      {
        route: 'help',
        target: 'nav-help',
        title: "That's it!",
        body: 'Step-by-step guides live here in Help, and you can replay this tour anytime. Have fun forging. 🎶'
      }
    ]
  },
  studio: {
    name: 'Studio tour',
    steps: [
      {
        title: 'This is the studio 🎛️',
        body: 'Here you turn the video into songs. Your work saves automatically as a draft, so you can leave and come back anytime.'
      },
      {
        target: 'studio-clips',
        title: 'Clips',
        body: 'Each clip becomes one song. You can make as many as you like from one video, like every song in a live stage. Click one to edit it.'
      },
      {
        target: 'studio-suggest',
        title: 'Let SongForge find the songs',
        body: 'The wand looks through the video for songs (using chapters, or by listening) and turns them into clips in one click. Great for long stages and streams.'
      },
      {
        target: 'studio-waveform',
        title: 'The waveform',
        body: (
          <>
            Drag across it to make a new clip. Drag a clip's edges to trim it, or drag the middle to move it. Click anywhere to jump there. The strip underneath shows the whole video.
          </>
        )
      },
      {
        target: 'studio-transport',
        title: 'Listen and fine-tune',
        body: (
          <>
            Play the clip (<Kbd>Space</Kbd>). <b>Loop</b> repeats the clip, and <b>Live FX</b> plays your speed, pitch and effects as you edit. Press <Kbd>I</Kbd> and <Kbd>O</Kbd> to set the start and end where the playhead is.
          </>
        )
      },
      {
        target: 'studio-tabs',
        title: 'Shape the song',
        body: (
          <>
            <b>Trim</b> for exact start and end points. <b>Sound</b> for sped up, slowed, reverb, EQ and instrumental. <b>Tags</b> for the title and artist. <b>Lyrics</b> to find synced lyrics. <b>Cover</b> to pick artwork or a video frame.
          </>
        )
      },
      {
        target: 'studio-forge',
        title: 'Forge it',
        body: 'This saves the selected clip as a tagged MP3 in your library and Spotify folder. You can change things and save again later.'
      },
      {
        target: 'studio-forge-all',
        title: 'Or forge everything',
        body: 'Saves every clip that changed in one go.'
      },
      {
        target: 'studio-help',
        title: 'Need a hand?',
        body: (
          <>
            The keyboard button lists every shortcut (or press <Kbd>?</Kbd>), and the question mark replays this tour. Undo is <Kbd>Ctrl+Z</Kbd>.
          </>
        )
      }
    ]
  }
}

/** Find a visible element for a step (several can share a data-tour name, e.g. rail vs. panel). */
function findTarget(name: string): HTMLElement | null {
  const els = [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)]
  return els.find((e) => e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0) ?? null
}

export async function markTourSeen(id: TourId) {
  const { settings, setSettings } = useApp.getState()
  if (!settings || settings.toursSeen?.includes(id)) return
  setSettings(await api.settings.set({ toursSeen: [...(settings.toursSeen ?? []), id] }))
}

const PAD = 6
const GAP = 14
const CARD_W = 340

export function Tour() {
  const id = useApp((s) => s.tour) as TourId | null
  const route = useApp((s) => s.route)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [card, setCard] = useState({ w: CARD_W, h: 200 })
  const cardRef = useRef<HTMLDivElement>(null)
  const steps = id ? TOURS[id].steps : []
  const step = steps[i]

  useEffect(() => setI(0), [id])

  const close = useCallback(() => {
    if (id) markTourSeen(id)
    useApp.getState().endTour()
  }, [id])
  const next = useCallback(() => (i + 1 < steps.length ? setI(i + 1) : close()), [i, steps.length, close])
  const back = useCallback(() => setI((x) => Math.max(0, x - 1)), [])

  // Go to the step's page, then follow its target as the layout moves
  useEffect(() => {
    if (!step) return
    const st = useApp.getState()
    if (step.route && st.route.name !== step.route) {
      if (step.route === 'help' || step.route === 'forge' || step.route === 'library' || step.route === 'spotify' || step.route === 'settings') st.navigate({ name: step.route })
    }
    if (!step.target) {
      setRect(null)
      return
    }
    let raf = 0
    let scrolled = false
    const started = performance.now()
    const tick = () => {
      const el = findTarget(step.target!)
      if (el) {
        const r = el.getBoundingClientRect()
        if (!scrolled && (r.top < 0 || r.bottom > innerHeight)) {
          el.scrollIntoView({ block: 'center' })
          scrolled = true
        }
        setRect((old) => (old && Math.abs(old.x - r.x) < 0.5 && Math.abs(old.y - r.y) < 0.5 && Math.abs(old.width - r.width) < 0.5 && Math.abs(old.height - r.height) < 0.5 ? old : r))
      } else if (performance.now() - started > 1500) setRect(null) // not on screen: show the card in the middle
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [step, route.name])

  useLayoutEffect(() => {
    const el = cardRef.current
    if (el) setCard({ w: el.offsetWidth, h: el.offsetHeight })
  }, [i, id, rect?.width])

  // The tour owns the keyboard while it's open (so Space doesn't start playback underneath)
  useEffect(() => {
    if (!id) return
    const h = (e: KeyboardEvent) => {
      e.stopImmediatePropagation()
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      else if (e.key === 'ArrowLeft') back()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [id, close, next, back])

  if (!id || !step) return null

  // Place the card beside the spotlight, wherever it fits best
  const W = innerWidth
  const H = innerHeight
  let left = (W - card.w) / 2
  let top = (H - card.h) / 2
  let hole: { x: number; y: number; w: number; h: number } | null = null
  if (rect) {
    hole = { x: rect.left - PAD, y: rect.top - PAD, w: rect.width + PAD * 2, h: rect.height + PAD * 2 }
    const below = hole.y + hole.h + GAP
    const above = hole.y - GAP - card.h
    const right = hole.x + hole.w + GAP
    const leftSide = hole.x - GAP - card.w
    if (below + card.h <= H - 8) {
      top = below
      left = hole.x + hole.w / 2 - card.w / 2
    } else if (above >= 8) {
      top = above
      left = hole.x + hole.w / 2 - card.w / 2
    } else if (right + card.w <= W - 8) {
      left = right
      top = hole.y + hole.h / 2 - card.h / 2
    } else if (leftSide >= 8) {
      left = leftSide
      top = hole.y + hole.h / 2 - card.h / 2
    } else {
      top = H - card.h - 16 // huge target: sit at the bottom, on top of it
    }
    left = Math.max(12, Math.min(left, W - card.w - 12))
    top = Math.max(12, Math.min(top, H - card.h - 12))
  }
  const last = i === steps.length - 1

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-label={`${TOURS[id].name}: ${step.title}`}>
      {/* Blocks clicks on the app while touring */}
      <div className={cx('absolute inset-0', !hole && 'bg-black/60 backdrop-blur-[1px]')} onClick={(e) => e.stopPropagation()} />
      {hole && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-ember-400 transition-all duration-300 ease-out"
          style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.62), 0 0 24px 2px color-mix(in oklab, var(--color-ember-500) 45%, transparent)' }}
        />
      )}
      <div
        ref={cardRef}
        className="absolute w-[340px] max-w-[calc(100vw-24px)] rounded-2xl border border-ink-600 bg-ink-850 p-5 text-ink-100 shadow-2xl transition-[left,top] duration-300 ease-out"
        style={{ left, top }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ember-400">
            {TOURS[id].name} · {i + 1} of {steps.length}
          </span>
          <button onClick={close} className="rounded-full p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100" aria-label="Close tour">
            <X size={15} />
          </button>
        </div>
        <h3 className="mt-2 text-[17px] font-bold leading-snug">{step.title}</h3>
        <div className="mt-1.5 text-sm leading-relaxed text-ink-300">{step.body}</div>
        <div className="mt-4 flex items-center gap-1">
          {steps.map((_, n) => (
            <button
              key={n}
              onClick={() => setI(n)}
              aria-label={`Go to step ${n + 1}`}
              className={cx('h-1.5 rounded-full transition-all', n === i ? 'w-5 bg-ember-400' : n < i ? 'w-1.5 bg-ink-400' : 'w-1.5 bg-ink-600')}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button onClick={close} className="text-xs text-ink-400 hover:text-ink-100">
            {last ? '' : 'Skip tour'}
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <Button size="sm" variant="ghost" onClick={back} icon={<ArrowLeft size={14} />}>
                Back
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={next}>
              {last ? (
                <>
                  <Check size={14} /> Done
                </>
              ) : (
                <>
                  Next <ArrowRight size={14} />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
