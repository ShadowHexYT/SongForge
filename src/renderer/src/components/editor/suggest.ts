import type { Chapter } from '@shared/types'
import { snapToQuiet } from './model'

export interface Suggestion {
  start: number
  end: number
  /** 0..1, how clearly this stands out as music */
  confidence: number
  title?: string
  from: 'chapters' | 'audio'
}

const NOT_SONGS = /\b(intro|outro|talk|ment|mc|interview|ending|opening|vcr|behind|q ?& ?a|greeting|announcement|transition|outfit change|costume change|intermission)\b/i

/** The song a chapter belongs to: the last quoted name ("Dance Break | 'EASY'" → easy), else the title. */
function chapterSong(title: string): string {
  const quoted = [...title.matchAll(/['‘’"“”]([^'‘’"“”]{1,60})['‘’"“”]/g)].pop()?.[1]
  return (quoted ?? title).toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** Join back-to-back chapters of the same song (intro, dance break, remix parts). */
function mergeChapters(chapters: Chapter[]): Chapter[] {
  const out: Array<Chapter & { key: string; best: number }> = []
  for (const c of chapters) {
    const key = chapterSong(c.title)
    const last = out[out.length - 1]
    if (last && key && last.key === key && c.start - last.end < 2) {
      last.end = c.end
      // Name the merged clip after its longest non-filler part
      if (c.end - c.start > last.best && !NOT_SONGS.test(c.title)) {
        last.best = c.end - c.start
        last.title = c.title
      }
    } else out.push({ ...c, key, best: NOT_SONGS.test(c.title) ? 0 : c.end - c.start })
  }
  return out
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]
}

/** Otsu's method: the threshold that best separates two groups (music vs. not music). */
function otsu(values: number[]): number {
  const bins = 64
  const max = Math.max(...values, 1e-6)
  const hist = new Array(bins).fill(0)
  for (const v of values) hist[Math.min(bins - 1, Math.floor((v / max) * bins))]++
  const total = values.length
  let sum = 0
  for (let i = 0; i < bins; i++) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let best = 0
  let bestVar = -1
  for (let i = 0; i < bins; i++) {
    wB += hist[i]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += i * hist[i]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > bestVar) {
      bestVar = between
      best = i
    }
  }
  return ((best + 0.5) / bins) * max
}

const smooth = (xs: number[], radius: number) =>
  xs.map((_, i) => {
    let s = 0
    let n = 0
    for (let j = Math.max(0, i - radius); j <= Math.min(xs.length - 1, i + radius); j++) {
      s += xs[j]
      n++
    }
    return s / n
  })

/**
 * Find the songs in a long video (live stages, streams, compilations).
 * Uses YouTube chapters when there are any; otherwise it looks at the waveform. Music is loud
 * and steady, while talking and pauses between songs are quieter and full of short gaps.
 */
export function suggestClips(peaks: number[], perSecond: number, duration: number, chapters: Chapter[] = []): Suggestion[] {
  const songChapters = mergeChapters(chapters).filter((c) => c.end - c.start >= 30 && !NOT_SONGS.test(c.title))
  if (songChapters.length >= 2) {
    return songChapters.map((c) => ({ start: c.start, end: c.end, confidence: 1, title: c.title, from: 'chapters' }))
  }

  const secs = Math.floor(peaks.length / perSecond)
  if (secs < 20) return []

  // Per-second loudness and "gappiness"
  const energy: number[] = []
  for (let i = 0; i < secs; i++) {
    let s = 0
    for (let j = 0; j < perSecond; j++) s += peaks[i * perSecond + j] ?? 0
    energy.push(s / perSecond)
  }
  const ref = percentile(energy, 0.95) || 1
  const gaps: number[] = []
  for (let i = 0; i < secs; i++) {
    const a = Math.max(0, (i - 1) * perSecond)
    const b = Math.min(peaks.length, (i + 2) * perSecond)
    const win = peaks.slice(a, b)
    const floor = Math.max(0.04, percentile(win, 0.9) * 0.22)
    gaps.push(win.filter((v) => v < floor).length / Math.max(1, win.length))
  }
  const score = smooth(
    energy.map((e, i) => Math.min(1.5, e / ref) * (1 - gaps[i])),
    3
  )
  const thr = Math.min(0.62, Math.max(0.16, otsu(score)))

  // Mark music seconds, then close short dips and drop short blips
  const music = score.map((v) => v > thr)
  const minGap = 6
  const minLen = duration < 240 ? 20 : 40
  let segs: Array<[number, number]> = []
  let s = -1
  for (let i = 0; i <= secs; i++) {
    if (i < secs && music[i]) {
      if (s < 0) s = i
    } else if (s >= 0) {
      segs.push([s, i])
      s = -1
    }
  }
  const merged: Array<[number, number]> = []
  for (const seg of segs) {
    const last = merged[merged.length - 1]
    if (last && seg[0] - last[1] < minGap) last[1] = seg[1]
    else merged.push([...seg])
  }
  segs = merged.filter(([a, b]) => b - a >= minLen)

  return segs.map(([a, b]) => {
    const inside = score.slice(a, b)
    const mean = inside.reduce((x, y) => x + y, 0) / Math.max(1, inside.length)
    const start = snapToQuiet(peaks, perSecond, Math.max(0, a - 0.5), 1.2)
    const end = snapToQuiet(peaks, perSecond, Math.min(duration, b + 0.5), 1.2)
    return { start, end: Math.max(end, start + 1), confidence: Math.max(0, Math.min(1, (mean - thr) / Math.max(0.05, 1 - thr) + 0.35)), from: 'audio' as const }
  })
}
