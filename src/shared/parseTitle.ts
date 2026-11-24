/**
 * Heuristics to guess song title / artist from a YouTube video title.
 * Handles common fancam / live / MV naming patterns, e.g.
 *   "[4K] 241005 LE SSERAFIM CHAEWON 'EASY' Fancam @ Music Bank"
 *   "Chaewon - Song Title (Cover) | Live Clip"
 *   "[MV] IU(아이유) _ Blueming(블루밍)"
 */
export interface TitleGuess {
  title: string
  artist: string
}

const NOISE = [
  /\[[^\]]*\]/g, // [4K], [MV], [Fancam]
  /【[^】]*】/g,
  /\b(official\s+)?(music\s+)?video\b/gi,
  /\b(official\s+)?(lyric|lyrics)\s+video\b/gi,
  /\bofficial\s+audio\b/gi,
  /\b(fan\s?cam|focus\s?cam|직캠|직캠\s?\d*|full\s?cam|vertical)\b/gi,
  /\b(4k|8k|1080p|60fps|hd|uhd|hq)\b/gi,
  /\b\d{6}\b/g, // 241005 date stamps
  /@\s?.*$/g, // "@ Music Bank ..."
  /\|.*$/g // "| Live clip"
]

function clean(s: string): string {
  let out = s
  for (const re of NOISE) out = out.replace(re, ' ')
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—_:|•·∙★☆♪♬~]+|[\s\-–—_:|•·∙★☆♪♬~]+$/g, '')
    .trim()
}

/** Strip Korean/Japanese parenthetical duplicates: "IU(아이유)" -> "IU" */
function stripNativeParens(s: string): string {
  return s.replace(/\s*[(（][^)）]*[぀-ヿ㄰-㆏가-힯一-鿿][^)）]*[)）]/g, '').trim()
}

export function guessFromTitle(raw: string, channel = ''): TitleGuess {
  // Normalize pipe-like dividers (incl. the Korean jamo "ㅣ" often typed as a divider).
  // For "Performer | Original Artist - 'Song'" covers, the performer is what comes first.
  const original = raw.trim().replace(/\s*[|｜ㅣ]\s*/g, ' | ')

  // Quoted song names: CHAEWON 'EASY'  /  Chaewon "Song"
  const quoted = original.match(/['‘’"“”]([^'‘’"“”]{1,80})['‘’"“”]/)
  if (quoted) {
    const before = clean(original.slice(0, quoted.index))
    const artist = stripNativeParens(before.split(/\s[-–—_|]\s/).pop() ?? before)
    return { title: quoted[1].trim(), artist: artist || channel }
  }

  // "Song | Artist | ..." (no dash): first segment is the song, second the artist
  const pipes = original.split(' | ')
  if (pipes.length >= 2 && !/\s[-–—_]\s/.test(pipes[0])) {
    const title = stripNativeParens(clean(pipes[0]))
    const artist = stripNativeParens(clean(pipes[1]))
    if (title && artist) return { title, artist }
  }

  const c = clean(original)

  // "Artist - Title" or "Artist _ Title"
  const dash = c.split(/\s+[-–—_]\s+/)
  if (dash.length >= 2) {
    return {
      artist: stripNativeParens(dash[0]),
      title: stripNativeParens(dash.slice(1).join(' - ').replace(/\((official|lyrics?|audio|mv)[^)]*\)/gi, '').trim())
    }
  }

  return { title: stripNativeParens(c) || original, artist: channel.replace(/\s*-\s*Topic$/, '') }
}
