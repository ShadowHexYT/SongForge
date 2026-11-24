import { createWriteStream, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Zip, ZipDeflate, ZipPassThrough, strToU8, zipSync } from 'fflate'
import { openZip } from '../src/main/zipread'

const dir = mkdtempSync(join(tmpdir(), 'sf-zip-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const text = (b: Uint8Array | null) => new TextDecoder().decode(b ?? new Uint8Array())

/** Streams entries the same way song pack export does */
async function streamZip(file: string, entries: Array<[string, Uint8Array, boolean?]>) {
  const out = createWriteStream(file)
  const done = new Promise<void>((r) => out.on('finish', () => r()))
  const zip = new Zip((err, chunk, final) => {
    if (err) throw err
    out.write(chunk)
    if (final) out.end()
  })
  for (const [name, data, deflate] of entries) {
    const f = deflate ? new ZipDeflate(name) : new ZipPassThrough(name)
    zip.add(f)
    f.push(data, true)
  }
  zip.end()
  await done
}

describe('openZip', () => {
  it('reads stored and deflated entries from a streamed zip', async () => {
    const big = new Uint8Array(3_000_000).map((_, i) => i % 251)
    const file = join(dir, 'a.songforge')
    await streamZip(file, [
      ['songs/0001.mp3', big],
      ['songs/0001.jpg', strToU8('jpeg bytes'), true],
      ['pack.json', strToU8('{"format":"songforge-pack"}')]
    ])
    const z = openZip(file)
    try {
      expect(z.names).toEqual(['songs/0001.mp3', 'songs/0001.jpg', 'pack.json'])
      expect(z.read('songs/0001.mp3')).toEqual(big)
      expect(text(z.read('songs/0001.jpg'))).toBe('jpeg bytes')
      expect(text(z.read('pack.json'))).toContain('songforge-pack')
      expect(z.read('missing')).toBeNull()
    } finally {
      z.close()
    }
  })

  it('reads zips with a comment and ones made all at once', () => {
    const file = join(dir, 'b.zip')
    writeFileSync(file, zipSync({ 'x.txt': strToU8('hi') }, { comment: 'made elsewhere' }))
    const z = openZip(file)
    expect(text(z.read('x.txt'))).toBe('hi')
    z.close()
  })

  it('rejects files that are not zips', () => {
    const file = join(dir, 'c.songforge')
    writeFileSync(file, 'definitely not a zip')
    expect(() => openZip(file)).toThrow()
  })
})
