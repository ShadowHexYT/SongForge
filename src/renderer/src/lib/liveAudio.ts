import type { FxSettings } from '@shared/types'
import { makeImpulse, reverbMix } from '@shared/reverb'

/**
 * Live preview of clip effects while editing: pitch (AudioWorklet), speed (playbackRate with
 * preserved pitch), gain and fade envelopes. Exports use ffmpeg's rubberband for full quality;
 * this is a close real-time approximation.
 */

// A classic two-tap delay-line pitch shifter with Hann crossfades.
const WORKLET = `
class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4 }] }
  constructor() {
    super()
    this.size = 16384
    this.win = 2400
    this.buf = [new Float32Array(this.size), new Float32Array(this.size)]
    this.w = 0
    this.phase = 0
  }
  read(b, pos) {
    const size = this.size
    pos = ((pos % size) + size) % size
    const i = Math.floor(pos), f = pos - i
    return b[i] * (1 - f) + b[(i + 1) % size] * f
  }
  process(inputs, outputs, params) {
    const input = inputs[0], output = outputs[0]
    if (!input || !input.length) return true
    const ratio = params.ratio[0]
    const n = input[0].length
    const chans = Math.min(output.length, 2)
    const bypass = Math.abs(ratio - 1) < 0.001
    const W = this.win
    for (let i = 0; i < n; i++) {
      const p1 = this.phase, p2 = (this.phase + 0.5) % 1
      const g1 = 0.5 - 0.5 * Math.cos(2 * Math.PI * p1)
      const g2 = 0.5 - 0.5 * Math.cos(2 * Math.PI * p2)
      for (let c = 0; c < chans; c++) {
        const src = input[Math.min(c, input.length - 1)]
        const b = this.buf[c]
        b[this.w] = src[i]
        output[c][i] = bypass ? src[i] : g1 * this.read(b, this.w - p1 * W) + g2 * this.read(b, this.w - p2 * W)
      }
      this.phase += (1 - ratio) / W
      this.phase -= Math.floor(this.phase)
      this.w = (this.w + 1) % this.size
    }
    return true
  }
}
registerProcessor('sf-pitch-shifter', PitchShifter)
`

export interface LiveParams {
  enabled: boolean
  pitch: number // semitones
  speed: number
  gainDb: number
  start: number
  end: number
  fadeIn: number
  fadeOut: number
  fx: FxSettings
}

export class LiveAudio {
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private shifter: AudioWorkletNode | null = null
  private eq: BiquadFilterNode[] = []
  private dry: GainNode | null = null
  private wet: GainNode | null = null
  private convolver: ConvolverNode | null = null
  private room = -1
  private raf = 0
  private params: LiveParams | null = null
  private ready: Promise<void> | null = null

  constructor(private media: HTMLMediaElement) {}

  /** Lazily build the audio graph (must happen after a user gesture for AudioContext). */
  init(): Promise<void> {
    if (this.ready) return this.ready
    this.ready = (async () => {
      const ctx = new AudioContext({ latencyHint: 'interactive' })
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
      try {
        await ctx.audioWorklet.addModule(url)
        this.shifter = new AudioWorkletNode(ctx, 'sf-pitch-shifter', { outputChannelCount: [2] })
      } catch (e) {
        console.warn('Pitch preview unavailable', e)
      } finally {
        URL.revokeObjectURL(url)
      }
      const src = ctx.createMediaElementSource(this.media)
      this.gain = ctx.createGain()
      // Same EQ points as the export (bass shelf 110 Hz, mid bell 2.2 kHz, treble shelf 7 kHz)
      const mk = (type: BiquadFilterType, f: number, q?: number) => {
        const b = ctx.createBiquadFilter()
        b.type = type
        b.frequency.value = f
        if (q) b.Q.value = q
        b.gain.value = 0
        return b
      }
      this.eq = [mk('lowshelf', 110), mk('peaking', 2200, 0.9), mk('highshelf', 7000)]
      let node: AudioNode = this.shifter ? src.connect(this.shifter) : src
      for (const b of this.eq) node = node.connect(b)
      this.dry = ctx.createGain()
      this.wet = ctx.createGain()
      this.wet.gain.value = 0
      this.convolver = ctx.createConvolver()
      node.connect(this.dry).connect(this.gain)
      node.connect(this.convolver).connect(this.wet).connect(this.gain)
      this.gain.connect(ctx.destination)
      this.ctx = ctx
      if (this.params) this.update(this.params)
      this.loop()
    })()
    return this.ready
  }

  update(p: LiveParams) {
    this.params = p
    const m = this.media as HTMLMediaElement & { preservesPitch?: boolean }
    m.preservesPitch = true
    const rate = p.enabled ? p.speed : 1
    if (Math.abs(m.playbackRate - rate) > 0.001) m.playbackRate = rate
    if (this.shifter && this.ctx) {
      this.shifter.parameters.get('ratio')!.setValueAtTime(p.enabled ? Math.pow(2, p.pitch / 12) : 1, this.ctx.currentTime)
    }
    const ctx = this.ctx
    if (!ctx || !this.dry || !this.wet || !this.convolver) return
    const now = ctx.currentTime
    const fx = p.fx
    const gains = p.enabled ? [fx.bass, fx.mid, fx.treble] : [0, 0, 0]
    this.eq.forEach((b, i) => b.gain.setTargetAtTime(gains[i], now, 0.02))
    const amount = p.enabled ? fx.reverb : 0
    if (amount > 0 && Math.abs(this.room - fx.room) > 0.005) {
      // Rebuild the impulse only when the room size changes
      const [l, r] = makeImpulse(fx.room, ctx.sampleRate)
      const buf = ctx.createBuffer(2, l.length, ctx.sampleRate)
      buf.copyToChannel(l as Float32Array<ArrayBuffer>, 0)
      buf.copyToChannel(r as Float32Array<ArrayBuffer>, 1)
      this.convolver.buffer = buf
      this.room = fx.room
    }
    const { dry, wet } = reverbMix(amount)
    this.dry.gain.setTargetAtTime(dry, now, 0.03)
    this.wet.gain.setTargetAtTime(wet, now, 0.03)
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    if (!this.ctx || !this.gain || !this.params) return
    const p = this.params
    let g = 1
    if (p.enabled) {
      g = Math.pow(10, p.gainDb / 20)
      const t = this.media.currentTime
      if (t >= p.start && t <= p.end) {
        // Fades are defined in output time; convert to source time via speed.
        const fi = p.fadeIn * p.speed
        const fo = p.fadeOut * p.speed
        if (fi > 0) g *= Math.min(1, (t - p.start) / fi)
        if (fo > 0) g *= Math.min(1, Math.max(0, (p.end - t) / fo))
      }
    }
    this.gain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.015)
  }

  resume() {
    this.ctx?.resume()
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.ctx?.close()
    this.ctx = null
  }
}
