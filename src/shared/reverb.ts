/**
 * Deterministic reverb impulse response, shared by the live preview (ConvolverNode) and the
 * export (ffmpeg afir), so what you hear while editing matches the forged MP3.
 */
export const IR_RATE = 44100

export function reverbSeconds(room: number): number {
  return 0.6 + Math.max(0, Math.min(1, room)) * 3.4
}

/** Stereo decaying-noise impulse. `room` 0..1 sets size and decay time. */
export function makeImpulse(room: number, rate = IR_RATE): [Float32Array, Float32Array] {
  const secs = reverbSeconds(room)
  const n = Math.round(secs * rate)
  const decay = 2.2 + (1 - room) * 2.5
  const pre = Math.round(0.012 * rate) // short pre-delay keeps the dry voice clear
  let seed = 0x9e3779b9
  const rand = () => {
    // xorshift32: same numbers in Node and the browser
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return ((seed >>> 0) / 0xffffffff) * 2 - 1
  }
  const out: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)]
  for (let i = pre; i < n; i++) {
    const t = (i - pre) / (n - pre)
    const env = Math.pow(1 - t, decay)
    // Darken the tail: blend in a smoothed copy as it decays
    out[0][i] = rand() * env
    out[1][i] = rand() * env
  }
  // One-pole low-pass that closes over time, so the tail sounds warm rather than hissy
  for (const ch of out) {
    let y = 0
    for (let i = 0; i < n; i++) {
      const a = 0.15 + 0.75 * (1 - i / n)
      y += a * (ch[i] - y)
      ch[i] = y
    }
  }
  return out
}

/** Encode a stereo float impulse as a 32-bit float WAV file. */
export function impulseWav(room: number): Uint8Array {
  const [l, r] = makeImpulse(room)
  const n = l.length
  const dataBytes = n * 2 * 4
  const buf = new ArrayBuffer(44 + dataBytes)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + dataBytes, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 3, true) // IEEE float
  v.setUint16(22, 2, true)
  v.setUint32(24, IR_RATE, true)
  v.setUint32(28, IR_RATE * 8, true)
  v.setUint16(32, 8, true)
  v.setUint16(34, 32, true)
  str(36, 'data')
  v.setUint32(40, dataBytes, true)
  let o = 44
  for (let i = 0; i < n; i++) {
    v.setFloat32(o, l[i], true)
    v.setFloat32(o + 4, r[i], true)
    o += 8
  }
  return new Uint8Array(buf)
}

/** Wet/dry levels for a reverb amount 0..1 (equal-ish power, dry never fully drops). */
export function reverbMix(amount: number): { dry: number; wet: number } {
  const a = Math.max(0, Math.min(1, amount))
  return { dry: 1 - a * 0.45, wet: a * 0.9 }
}
