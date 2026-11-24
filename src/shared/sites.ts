/** Sites SongForge recognizes for pasting and the clipboard prompt. yt-dlp supports many more. */
export const SITES: Array<{ name: string; re: RegExp }> = [
  { name: 'YouTube', re: /(^|\.)(youtube\.com|youtu\.be)$/ },
  { name: 'TikTok', re: /(^|\.)tiktok\.com$/ },
  { name: 'Instagram', re: /(^|\.)instagram\.com$/ },
  { name: 'X', re: /(^|\.)(x\.com|twitter\.com)$/ },
  { name: 'SoundCloud', re: /(^|\.)soundcloud\.com$/ },
  { name: 'Bilibili', re: /(^|\.)(bilibili\.com|b23\.tv)$/ },
  { name: 'Vimeo', re: /(^|\.)vimeo\.com$/ },
  { name: 'Twitch', re: /(^|\.)twitch\.tv$/ },
  { name: 'Dailymotion', re: /(^|\.)dailymotion\.com$/ },
  { name: 'Facebook', re: /(^|\.)(facebook\.com|fb\.watch)$/ },
  { name: 'Weverse', re: /(^|\.)weverse\.io$/ },
  { name: 'Naver TV', re: /(^|\.)tv\.naver\.com$/ }
]

export function siteName(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\.|^m\./, '')
    return SITES.find((s) => s.re.test(host))?.name ?? null
  } catch {
    return null
  }
}

const YT_VIDEO = /(?:v=|\/shorts\/|youtu\.be\/|\/embed\/|\/live\/)[A-Za-z0-9_-]{11}/

/**
 * Links to many videos at once: YouTube playlists and channels, SoundCloud sets and artist pages.
 * A video link that also carries a playlist (watch?v=…&list=…) counts as the single video.
 */
export function isPlaylistUrl(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  const name = siteName(url)
  if (name === 'YouTube') {
    if (YT_VIDEO.test(url)) return false
    if (u.searchParams.get('list')) return true
    return /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)(\/(videos|streams|shorts|playlists|featured))?\/?$/.test(u.pathname)
  }
  if (name === 'SoundCloud') {
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[1] === 'sets') return parts.length === 3
    return parts.length === 1 || (parts.length === 2 && ['tracks', 'popular-tracks', 'albums', 'likes'].includes(parts[1]))
  }
  return false
}

/** A YouTube link must point at a video, playlist or channel, not the home page. */
function isUsable(url: string): boolean {
  const name = siteName(url)
  if (name !== 'YouTube') return true
  return YT_VIDEO.test(url) || isPlaylistUrl(url)
}

const URL_RE = /\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"'，、]*/gi

/**
 * Pull links out of pasted text. Known sites are always accepted; with `anySite`, any http(s)
 * link is too (yt-dlp will say if it can't open it).
 */
export function extractLinks(text: string, anySite = true): string[] {
  const out: string[] = []
  for (let m of text.match(URL_RE) ?? []) {
    m = m.replace(/[),.;!?\]]+$/, '')
    const url = /^https?:\/\//i.test(m) ? m : `https://${m}`
    const known = siteName(url) != null
    if (!(known || (anySite && /^https?:\/\//i.test(m)))) continue
    if (known && !isUsable(url)) continue
    if (!out.includes(url)) out.push(url)
  }
  return out
}
