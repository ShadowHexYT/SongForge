import type { Song } from './types'

/** Words that describe a version rather than the song itself. */
const VERSION_WORDS =
  /\b(live|sped\s*up|slowed(\s*\+?\s*reverb)?|nightcore|reverb|instrumental|inst\.?|karaoke|mr|acapella|a\s*cappella|vocals?(\s*only)?|cover|fancam|ver(sion)?\.?|remix|edit|acoustic|stage|clip|\d+)\b/gi

/** Normalized key used to stack versions of the same song. */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[([{【][^)\]}】]*[)\]}】]/g, ' ')
    .replace(VERSION_WORDS, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function versionKey(s: Pick<Song, 'title' | 'versionGroup'>): string {
  return s.versionGroup || titleKey(s.title) || s.title
}

/** Groups of songs that are versions of each other (only groups with 2+ songs). */
export function versionGroups(songs: Song[]): Map<string, Song[]> {
  const m = new Map<string, Song[]>()
  for (const s of songs) {
    const k = versionKey(s)
    const arr = m.get(k)
    if (arr) arr.push(s)
    else m.set(k, [s])
  }
  for (const [k, v] of m) if (v.length < 2) m.delete(k)
  return m
}

/** Short tags describing how a version differs ("Instrumental", "1.3×", "+4 st", "Reverb"). */
export function versionTags(s: Song): string[] {
  const t: string[] = []
  if (s.cleanup === 'instrumental') t.push('Instrumental')
  if (s.cleanup === 'vocals') t.push('Vocals only')
  if (s.speed && s.speed !== 1) t.push(`${s.speed}×`)
  if (s.pitch) t.push(`${s.pitch > 0 ? '+' : ''}${s.pitch} st`)
  if (s.fx?.reverb) t.push('Reverb')
  if (s.fx && (s.fx.bass || s.fx.mid || s.fx.treble)) t.push('EQ')
  if (s.medleyOf?.length) t.push('Medley')
  if (s.fromPack) t.push('From a pack')
  else if (s.imported) t.push('Imported')
  return t
}
