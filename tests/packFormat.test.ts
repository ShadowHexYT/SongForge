import { describe, expect, it } from 'vitest'
import { PACK_ENTRY, packSongFields } from '@shared/packFormat'

describe('packSongFields', () => {
  it('keeps good values', () => {
    const f = packSongFields(
      {
        title: ' LOVE DIVE ',
        artist: 'IVE',
        year: '2022',
        speed: 1.25,
        cleanup: 'instrumental',
        fx: { reverb: 0.4 },
        lyricsOffset: 1.5,
        sourceUrl: 'https://youtu.be/x',
        sourceTitle: 'MV'
      },
      'Road trip',
      180
    )
    expect(f).toMatchObject({
      title: 'LOVE DIVE',
      artist: 'IVE',
      year: '2022',
      speed: 1.25,
      cleanup: 'instrumental',
      lyricsOffset: 1.5,
      sourceUrl: 'https://youtu.be/x',
      sourceTitle: 'MV',
      fromPack: 'Road trip',
      imported: true,
      end: 180
    })
    expect(f.fx.reverb).toBe(0.4)
  })

  it('clamps and drops bad values from a stranger', () => {
    const f = packSongFields(
      {
        title: 42,
        year: '20x22',
        speed: 99,
        pitch: -1e9,
        gain: NaN,
        cleanup: 'rm -rf',
        fx: 'nope',
        sourceUrl: 'file:///C:/Users/me/song.mp3',
        sourceTitle: 'secret',
        lyrics: 'x'.repeat(200_000)
      },
      'Pack',
      100
    )
    expect(f.title).toBe('Untitled')
    expect(f.year).toBe('202')
    expect(f.speed).toBe(2)
    expect(f.pitch).toBe(-12)
    expect(f.gain).toBe(0)
    expect(f.cleanup).toBe('none')
    expect(f.fx.room).toBe(0.5)
    expect(f.sourceUrl).toBe('')
    expect(f.sourceTitle).toBe('Pack (song pack)')
    expect(f.lyrics).toHaveLength(100_000)
  })

  it('survives garbage entries', () => {
    expect(packSongFields(null, 'P', 10).title).toBe('Untitled')
    expect(packSongFields('song', 'P', 10).end).toBe(10)
  })

  it('only allows known file names', () => {
    expect(PACK_ENTRY.test('songs/0001.mp3')).toBe(true)
    expect(PACK_ENTRY.test('songs/0001.jpg')).toBe(true)
    expect(PACK_ENTRY.test('../evil.exe')).toBe(false)
    expect(PACK_ENTRY.test('songs/../../x.mp3')).toBe(false)
  })
})
