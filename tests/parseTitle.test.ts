import { describe, expect, it } from 'vitest'
import { guessFromTitle } from '@shared/parseTitle'

describe('guessFromTitle', () => {
  it('reads fancam titles', () => {
    expect(guessFromTitle("[4K] 241005 LE SSERAFIM CHAEWON 'EASY' Fancam @ Music Bank")).toEqual({ title: 'EASY', artist: 'LE SSERAFIM CHAEWON' })
  })
  it('reads "Artist - Title" and strips Korean duplicates', () => {
    expect(guessFromTitle('[MV] IU(아이유) _ Blueming(블루밍)')).toEqual({ artist: 'IU', title: 'Blueming' })
    expect(guessFromTitle('IVE - LOVE DIVE (Official MV)')).toEqual({ artist: 'IVE', title: 'LOVE DIVE' })
  })
  it('falls back to the channel name', () => {
    expect(guessFromTitle('Just a song', 'Someone - Topic')).toEqual({ title: 'Just a song', artist: 'Someone' })
  })
})
