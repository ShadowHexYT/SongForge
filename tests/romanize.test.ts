import { describe, expect, it } from 'vitest'
import { hasHangul, romanizeKorean } from '@shared/romanize'

describe('romanizeKorean', () => {
  it.each([
    ['서로를 비춰 밤새', 'seororeul bichwo bamsae'],
    ['숨 참고 love dive', 'sum chamgo love dive'],
    ['이건 사랑이야', 'igeon sarangiya'],
    ['감사합니다', 'gamsahamnida'],
    ['있는 그대로', 'inneun geudaero'],
    ['좋아', 'joa'],
    ['좋고', 'joko'],
    ['신라', 'silla'],
    ['종로', 'jongno'],
    ['읽어', 'ilgeo'],
    ['아이유', 'aiyu']
  ])('%s → %s', (ko, roman) => {
    expect(romanizeKorean(ko)).toBe(roman)
  })

  it('leaves other text alone', () => {
    expect(romanizeKorean('Hello, world! 夜')).toBe('Hello, world! 夜')
    expect(hasHangul('LOVE DIVE')).toBe(false)
    expect(hasHangul('LOVE 다이브')).toBe(true)
  })
})
