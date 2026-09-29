import { powerSpectrum } from './fft'

export interface SquelchOptions {
  /** A tone must stand this far above the median bin (dB) to count as signal. */
  thresholdDb: number
  /** Stays open this long after the last tone: decoders print characters late. */
  holdSeconds: number
  minHz: number
  maxHz: number
}

/** Measured on white noise: peak ≤ 13 dB over the median; CW at 0 dB SNR ≥ 22 dB. */
export const SQUELCH_DEFAULTS: SquelchOptions = { thresholdDb: 17, holdSeconds: 4, minHz: 300, maxHz: 1200 }

const HOP_SECONDS = 0.05
/** No tone for this long when the decoder loses the pitch means it is hunting in noise. */
const PITCH_LOST_SECONDS = 0.5

/** Opens while a narrow tone stands clearly above the noise floor. */
export class Squelch {
  private readonly sampleRate: number
  private readonly o: SquelchOptions
  private readonly size: number
  private readonly ring: Float32Array
  private readonly window: Float32Array
  private readonly lo: number
  private readonly hi: number
  private readonly hop: number
  private written = 0
  private sinceCheck = 0
  private lastTone = -Infinity

  constructor(sampleRate: number, options: SquelchOptions = SQUELCH_DEFAULTS) {
    this.sampleRate = sampleRate
    this.o = options
    // ~85 ms: fine enough to separate a tone from noise, short enough for fast dits.
    this.size = 2 ** Math.round(Math.log2(sampleRate * 0.085))
    this.ring = new Float32Array(this.size)
    this.window = Float32Array.from({ length: this.size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.size))
    this.lo = Math.ceil((options.minHz * this.size) / sampleRate)
    this.hi = Math.floor((options.maxHz * this.size) / sampleRate)
    this.hop = Math.round(sampleRate * HOP_SECONDS)
  }

  /** Seconds of audio seen so far. */
  get time(): number {
    return this.written / this.sampleRate
  }

  push(samples: Float32Array): void {
    for (const s of samples) {
      this.ring[this.written % this.size] = s
      this.written++
      if (++this.sinceCheck >= this.hop && this.written >= this.size) {
        this.sinceCheck = 0
        if (this.toneDb() > this.o.thresholdDb) this.lastTone = this.time
      }
    }
  }

  /** Peak-to-median ratio (dB) of the latest window inside the CW band. */
  toneDb(): number {
    const frame = new Float64Array(this.size)
    const oldest = this.written % this.size
    for (let i = 0; i < this.size; i++) frame[i] = this.ring[(oldest + i) % this.size] * this.window[i]
    const band = Array.from(powerSpectrum(frame).subarray(this.lo, this.hi + 1)).sort((a, b) => a - b)
    const peak = band[band.length - 1]
    const median = band[band.length >> 1]
    if (median <= 0) return peak > 0 ? Infinity : 0
    return 10 * Math.log10(peak / median)
  }

  /** The decoder lost the pitch: close unless a tone was just seen. */
  pitchLost(): void {
    if (this.time - this.lastTone > PITCH_LOST_SECONDS) this.lastTone = -Infinity
  }

  isOpen(): boolean {
    return this.time - this.lastTone < this.o.holdSeconds
  }
}
