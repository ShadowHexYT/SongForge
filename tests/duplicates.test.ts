import { describe, expect, it } from 'vitest'
import { findDuplicates, pickKeeper } from '@shared/duplicates'
import { song } from './fixtures'

describe('findDuplicates', () => {
  it('matches the same song with punctuation differences and a small length gap', () => {
    const a = song({ title: 'Love Dive' })
    const b = song({ title: 'love-dive!', duration: 181.5 })
    const c = song({ title: 'Love Dive', duration: 200 })
    expect(findDuplicates([a, b, c]).map((g) => g.map((s) => s.id))).toEqual([[a.id, b.id]])
  })

  it('never counts different versions as duplicates', () => {
    expect(findDuplicates([song(), song({ speed: 1.25 }), song({ cleanup: 'instrumental' })])).toEqual([])
  })

  it('matches the same clip of the same video, even after a rename', () => {
    const a = song({ sourceId: 'Y8JFxS1HlDo', title: 'A', start: 10, end: 190 })
    const b = song({ sourceId: 'Y8JFxS1HlDo', title: 'B', start: 10.4, end: 190.2 })
    const other = song({ sourceId: 'Y8JFxS1HlDo', title: 'C', start: 300, end: 480 })
    expect(findDuplicates([a, b, other]).map((g) => g.length)).toEqual([2])
  })

  it('treats imported and pack copies as the same sound', () => {
    expect(findDuplicates([song(), song({ imported: true }), song({ fromPack: 'Road trip' })])[0]).toHaveLength(3)
  })
})

describe('pickKeeper', () => {
  it('prefers the copy in playlists, then lyrics and cover, then the newest', () => {
    const a = song({ createdAt: 1 })
    const b = song({ createdAt: 2, lyrics: 'la la' })
    const c = song({ createdAt: 3 })
    expect(pickKeeper([a, b, c], () => 0).id).toBe(b.id)
    expect(pickKeeper([a, b, c], (id) => (id === a.id ? 1 : 0)).id).toBe(a.id)
    expect(pickKeeper([a, c], () => 0).id).toBe(c.id)
  })
})
