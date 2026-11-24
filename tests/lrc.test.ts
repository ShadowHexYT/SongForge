import { describe, expect, it } from 'vitest'
import { isLrc, lrcToPlain, parseLrc } from '@shared/lrc'

describe('lrc', () => {
  it('parses and sorts lines, including repeated timestamps', () => {
    const lines = parseLrc('[00:10.50] second\n[00:01.00][00:20.00] chorus\nno stamp')
    expect(lines).toEqual([
      { time: 1, text: 'chorus' },
      { time: 10.5, text: 'second' },
      { time: 20, text: 'chorus' }
    ])
  })
  it('detects LRC and converts to plain text', () => {
    expect(isLrc('[00:01.00] hi')).toBe(true)
    expect(isLrc('hi')).toBe(false)
    expect(lrcToPlain('[00:01.00] a\n[00:02.00] b')).toBe('a\nb')
  })
})
