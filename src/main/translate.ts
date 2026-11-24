import type { LyricsExtra } from '@shared/types'
import { hasHangul } from '@shared/romanize'

/**
 * Translations (and romanization for Japanese, Chinese and other non-Latin scripts) of lyric lines,
 * from Google Translate's free web endpoint. Only the lyric lines are sent. Nothing about the user is.
 * Korean romanization is done on this PC instead (see shared/romanize.ts), because it's better.
 */
const ENDPOINT = 'https://translate.googleapis.com/translate_a/single'
const SEP = '§'
const CHUNK = 3500

type Segment = [string | null, string | null, unknown?, string?, ...unknown[]]

async function request(text: string, to: string): Promise<{ lang: string; trans: string; roman: string }> {
  const qs = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: to, dt: 't' })
  const res = await fetch(`${ENDPOINT}?${qs}&dt=rm`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ q: text }),
    signal: AbortSignal.timeout(15000)
  })
  if (res.status === 429) throw new Error('The translator is busy. Try again in a few minutes.')
  if (!res.ok) throw new Error(`Translator error (${res.status})`)
  const j = (await res.json()) as [Segment[], unknown, string]
  const segs = Array.isArray(j?.[0]) ? j[0] : []
  return {
    lang: typeof j?.[2] === 'string' ? j[2] : '',
    trans: segs.filter((s) => typeof s?.[0] === 'string').map((s) => s[0]).join(''),
    roman: segs.filter((s) => s?.[0] == null && typeof s?.[3] === 'string').map((s) => s[3]).join('')
  }
}

const split = (s: string) => s.split(SEP).map((x) => x.trim())
const letters = (s: string) => /\p{L}/u.test(s)
const latinOnly = (s: string) => !/[^\p{Script=Latin}\P{L}]/u.test(s)

/** Translate a chunk of lines in one request; if the lines don't come back lined up, do them one by one. */
async function chunk(lines: string[], to: string): Promise<{ lang: string; out: Array<[string, string]> }> {
  const r = await request(lines.join(`\n${SEP}\n`), to)
  const t = split(r.trans)
  const ro = split(r.roman)
  if (t.length === lines.length) return { lang: r.lang, out: lines.map((_, i) => [ro.length === lines.length ? ro[i] : '', t[i]]) }
  const out: Array<[string, string]> = []
  for (const l of lines) {
    const one = await request(l, to)
    out.push([one.roman.trim(), one.trans.trim()])
  }
  return { lang: r.lang, out }
}

export async function translateLyrics(allLines: string[], to: string): Promise<LyricsExtra> {
  const uniq = [...new Set(allLines.map((l) => l.trim()).filter(letters))].filter((l) => !l.includes(SEP)).slice(0, 400)
  const groups: string[][] = [[]]
  let size = 0
  for (const l of uniq) {
    if (size + l.length > CHUNK && groups[groups.length - 1].length) {
      groups.push([])
      size = 0
    }
    groups[groups.length - 1].push(l)
    size += l.length + 3
  }

  const lines: LyricsExtra['lines'] = {}
  const langs = new Map<string, number>()
  try {
    for (const g of groups.filter((x) => x.length)) {
      const { lang, out } = await chunk(g, to)
      langs.set(lang, (langs.get(lang) ?? 0) + g.length)
      g.forEach((l, i) => {
        let [roman, trans] = out[i] ?? ['', '']
        // Korean is romanized locally; Latin-script lines don't need it
        if (hasHangul(l) || latinOnly(l) || roman.toLowerCase() === l.toLowerCase()) roman = ''
        if (trans.toLowerCase() === l.toLowerCase()) trans = ''
        if (roman || trans) lines[l] = [roman, trans]
      })
    }
  } catch (e) {
    if ((e as Error).name === 'TimeoutError') throw new Error('The translator took too long to answer. Try again.')
    if ((e as Error).message.startsWith('Translator') || (e as Error).message.startsWith('The translator')) throw e
    throw new Error("Couldn't reach the translator. Check your internet connection.")
  }
  const lang = [...langs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  return { lang, to, lines }
}
