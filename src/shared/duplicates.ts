import type { Song } from './types'
import { versionTags } from './versions'

/** Title as words only: "Love Dive (Live)" and "love dive - live" match, but "Love Dive" doesn't. */
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** How a version sounds (speed, pitch, effects…), ignoring where the file came from. */
const soundOf = (s: Song) =>
  versionTags(s)
    .filter((t) => t !== 'Imported' && t !== 'From a pack')
    .join(',')

/**
 * Songs that are probably the same file twice. Two songs match when they have the same title,
 * artist and sound settings and are within 2 seconds of each other, or when they were cut from
 * the same video at the same spot. Different versions (sped up, live, instrumental…) never match.
 */
export function findDuplicates(songs: Song[]): Song[][] {
  const parent = songs.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const join = (a: number, b: number) => {
    parent[find(a)] = find(b)
  }

  const buckets = new Map<string, number[]>()
  const bucket = (k: string, i: number) => {
    const arr = buckets.get(k)
    if (arr) arr.push(i)
    else buckets.set(k, [i])
  }
  songs.forEach((s, i) => {
    const sound = soundOf(s)
    const t = words(s.title)
    if (t) bucket(`t|${t}|${words(s.artist)}|${sound}`, i)
    if (s.sourceId && !s.medleyOf?.length) bucket(`s|${s.sourceId}|${sound}`, i)
  })

  for (const [k, idx] of buckets) {
    if (idx.length < 2) continue
    const bySource = k.startsWith('s|')
    for (let a = 0; a < idx.length; a++) {
      for (let b = a + 1; b < idx.length; b++) {
        const x = songs[idx[a]]
        const y = songs[idx[b]]
        const same = bySource ? Math.abs(x.start - y.start) < 1 && Math.abs(x.end - y.end) < 1 : Math.abs(x.duration - y.duration) <= 2
        if (same) join(idx[a], idx[b])
      }
    }
  }

  const groups = new Map<number, Song[]>()
  songs.forEach((s, i) => {
    const r = find(i)
    const arr = groups.get(r)
    if (arr) arr.push(s)
    else groups.set(r, [s])
  })
  return [...groups.values()].filter((g) => g.length > 1)
}

/** The copy to keep by default: in the most playlists, then with lyrics and a cover, then the newest. */
export function pickKeeper(group: Song[], playlistCount: (id: string) => number): Song {
  const score = (s: Song) => playlistCount(s.id) * 1000 + (s.syncedLyrics ? 20 : s.lyrics ? 10 : 0) + (s.coverPath ? 5 : 0)
  return [...group].sort((a, b) => score(b) - score(a) || b.createdAt - a.createdAt)[0]
}
