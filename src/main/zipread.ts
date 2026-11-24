import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { inflateSync } from 'fflate'

/**
 * Reads single entries from a zip file without loading the whole file into memory.
 * The central directory is read once; each entry is then read straight from its offset.
 * Supports stored and deflated entries (what fflate writes). No zip64: song packs stay under 4 GB.
 */
export interface ZipReader {
  names: string[]
  read: (name: string) => Uint8Array | null
  close: () => void
}

interface Entry {
  method: number
  size: number
  offset: number
}

const MAX_ENTRY = 1024 * 1024 * 1024

export function openZip(file: string): ZipReader {
  const fd = openSync(file, 'r')
  try {
    const total = fstatSync(fd).size
    const at = (pos: number, len: number) => {
      const b = Buffer.alloc(len)
      const n = readSync(fd, b, 0, len, pos)
      if (n !== len) throw new Error('unexpected end of file')
      return b
    }
    // The end-of-central-directory record sits in the last 22 bytes plus an optional comment
    const tailLen = Math.min(total, 22 + 0xffff)
    if (tailLen < 22) throw new Error('not a zip file')
    const tail = at(total - tailLen, tailLen)
    let eocd = -1
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i
        break
      }
    }
    if (eocd < 0) throw new Error('not a zip file')
    const count = tail.readUInt16LE(eocd + 10)
    const cdSize = tail.readUInt32LE(eocd + 12)
    const cdOffset = tail.readUInt32LE(eocd + 16)
    if (count === 0xffff || cdOffset === 0xffffffff || cdOffset + cdSize > total) throw new Error('this pack is too large or damaged')

    const cd = at(cdOffset, cdSize)
    const entries = new Map<string, Entry>()
    let p = 0
    for (let i = 0; i < count; i++) {
      if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) throw new Error('damaged zip directory')
      const method = cd.readUInt16LE(p + 10)
      const size = cd.readUInt32LE(p + 20)
      const nameLen = cd.readUInt16LE(p + 28)
      const extraLen = cd.readUInt16LE(p + 30)
      const commentLen = cd.readUInt16LE(p + 32)
      const offset = cd.readUInt32LE(p + 42)
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen)
      entries.set(name, { method, size, offset })
      p += 46 + nameLen + extraLen + commentLen
    }

    return {
      names: [...entries.keys()],
      read(name) {
        const e = entries.get(name)
        if (!e) return null
        if (e.size > MAX_ENTRY) throw new Error('file in the pack is too large')
        const local = at(e.offset, 30)
        if (local.readUInt32LE(0) !== 0x04034b50) throw new Error('damaged zip entry')
        const start = e.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28)
        if (start + e.size > total) throw new Error('damaged zip entry')
        const raw = new Uint8Array(at(start, e.size))
        if (e.method === 0) return raw
        if (e.method === 8) return inflateSync(raw)
        throw new Error('unsupported compression')
      },
      close: () => closeSync(fd)
    }
  } catch (err) {
    closeSync(fd)
    throw err
  }
}
