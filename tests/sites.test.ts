import { describe, expect, it } from 'vitest'
import { extractLinks, isPlaylistUrl, siteName } from '@shared/sites'

describe('sites', () => {
  it('names known sites', () => {
    expect(siteName('https://www.youtube.com/watch?v=abcdefghijk')).toBe('YouTube')
    expect(siteName('https://m.soundcloud.com/x')).toBe('SoundCloud')
    expect(siteName('https://example.com/x')).toBeNull()
    expect(siteName('not a url')).toBeNull()
  })

  it('tells playlists and channels from single videos', () => {
    expect(isPlaylistUrl('https://www.youtube.com/playlist?list=PL123')).toBe(true)
    expect(isPlaylistUrl('https://www.youtube.com/@IVEstarship')).toBe(true)
    expect(isPlaylistUrl('https://www.youtube.com/@IVEstarship/videos')).toBe(true)
    expect(isPlaylistUrl('https://www.youtube.com/watch?v=Y8JFxS1HlDo&list=PL123')).toBe(false)
    expect(isPlaylistUrl('https://youtu.be/Y8JFxS1HlDo')).toBe(false)
    expect(isPlaylistUrl('https://soundcloud.com/artist/sets/album')).toBe(true)
    expect(isPlaylistUrl('https://soundcloud.com/artist/track-name')).toBe(false)
    expect(isPlaylistUrl('https://soundcloud.com/artist')).toBe(true)
  })

  it('pulls links out of pasted text', () => {
    const text = 'look (https://youtu.be/Y8JFxS1HlDo), also youtube.com/watch?v=abcdefghijk and https://www.youtube.com/'
    expect(extractLinks(text)).toEqual(['https://youtu.be/Y8JFxS1HlDo', 'https://youtube.com/watch?v=abcdefghijk'])
    expect(extractLinks('https://example.com/song.mp3', false)).toEqual([])
    expect(extractLinks('https://example.com/song.mp3')).toEqual(['https://example.com/song.mp3'])
  })
})
