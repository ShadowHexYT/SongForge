import { FX_DEFAULTS, type Song } from '@shared/types'

let n = 0
export function song(over: Partial<Song> = {}): Song {
  n++
  return {
    id: `s${n}`,
    title: 'LOVE DIVE',
    artist: 'IVE',
    album: '',
    year: '',
    genre: '',
    lyrics: '',
    start: 0,
    end: 180,
    fadeIn: 0,
    fadeOut: 0,
    normalize: false,
    cleanup: 'none',
    gain: 0,
    pitch: 0,
    speed: 1,
    fx: { ...FX_DEFAULTS },
    filePath: `C:\\music\\s${n}.mp3`,
    coverPath: null,
    duration: 180,
    sourceUrl: '',
    sourceId: '',
    sourceTitle: '',
    createdAt: n,
    updatedAt: n,
    ...over
  }
}
