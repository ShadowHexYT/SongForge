export interface LrcLine {
  time: number
  text: string
}

/** Parse LRC text ("[01:23.45] line"). Lines can carry several timestamps. */
export function parseLrc(text: string): LrcLine[] {
  const out: LrcLine[] = []
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)]
    if (!stamps.length) continue
    const body = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const m of stamps) out.push({ time: Number(m[1]) * 60 + Number(m[2].replace(':', '.')), text: body })
  }
  return out.sort((a, b) => a.time - b.time)
}

export function lrcToPlain(text: string): string {
  return parseLrc(text)
    .map((l) => l.text)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function isLrc(text: string): boolean {
  return /^\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/m.test(text)
}
