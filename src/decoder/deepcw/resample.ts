/**
 * Streaming sample-rate converter: a Hamming-windowed sinc low-pass evaluated only where
 * output samples fall, with linear interpolation between the two filtered neighbours.
 */
export class Resampler {
  private readonly step: number
  private readonly kernel: Float32Array
  private readonly half: number
  /** Input not yet fully used, starting with `half` samples of history. */
  private buf: Float32Array
  /** Position of the next output sample in `buf`. */
  private pos: number

  constructor(inRate: number, outRate: number) {
    this.step = inRate / outRate
    const cutoff = (0.45 * outRate) / inRate
    // Hamming transition width ≈ 3.3 fs / taps; aim for ~12 % of the output rate (400 Hz at 3.2 kHz).
    const taps = Math.max(33, Math.ceil((3.3 * inRate) / (0.125 * outRate)) | 1)
    this.half = (taps - 1) / 2
    this.kernel = new Float32Array(taps)
    let sum = 0
    for (let k = 0; k < taps; k++) {
      const x = k - this.half
      const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x)
      this.kernel[k] = sinc * (0.54 - 0.46 * Math.cos((2 * Math.PI * k) / (taps - 1)))
      sum += this.kernel[k]
    }
    for (let k = 0; k < taps; k++) this.kernel[k] /= sum
    this.buf = new Float32Array(this.half)
    this.pos = this.half
  }

  push(input: Float32Array): Float32Array {
    const buf = new Float32Array(this.buf.length + input.length)
    buf.set(this.buf)
    buf.set(input, this.buf.length)
    const out: number[] = []
    while (Math.floor(this.pos) + 1 + this.half < buf.length) {
      const i = Math.floor(this.pos)
      const a = this.filtered(buf, i)
      out.push(a + (this.filtered(buf, i + 1) - a) * (this.pos - i))
      this.pos += this.step
    }
    const drop = Math.max(0, Math.floor(this.pos) - this.half)
    this.buf = buf.slice(drop)
    this.pos -= drop
    return Float32Array.from(out)
  }

  private filtered(buf: Float32Array, i: number): number {
    let s = 0
    const from = i - this.half
    for (let k = 0; k < this.kernel.length; k++) s += this.kernel[k] * buf[from + k]
    return s
  }
}
