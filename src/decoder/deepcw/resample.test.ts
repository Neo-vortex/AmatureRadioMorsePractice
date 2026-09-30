import { describe, expect, it } from 'vitest'
import { Resampler } from './resample'

const tone = (hz: number, rate: number, seconds: number) =>
  Float32Array.from({ length: Math.round(rate * seconds) }, (_, n) => Math.sin((2 * Math.PI * hz * n) / rate))

const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length)

/** Skips the filter's start-up transient. */
const settled = (x: Float32Array) => x.subarray(400, x.length - 400)

describe('Resampler', () => {
  it('keeps a 700 Hz tone: amplitude and frequency', () => {
    const out = settled(new Resampler(48000, 3200).push(tone(700, 48000, 1)))
    expect(Math.abs(rms(out) - Math.SQRT1_2) / Math.SQRT1_2).toBeLessThan(0.02)
    let crossings = 0
    for (let n = 1; n < out.length; n++) if (out[n - 1] < 0 && out[n] >= 0) crossings++
    expect(Math.abs(crossings / (out.length / 3200) - 700) / 700).toBeLessThan(0.01)
  })

  it('removes content above the new Nyquist frequency (≥ 40 dB)', () => {
    const out = settled(new Resampler(48000, 3200).push(tone(2000, 48000, 1)))
    expect(rms(out)).toBeLessThan(Math.SQRT1_2 / 100)
  })

  it('gives the same output in chunks as in one go', () => {
    const x = tone(650, 44100, 0.5)
    const whole = new Resampler(44100, 3200).push(x)
    const r = new Resampler(44100, 3200)
    const parts: number[] = []
    for (let o = 0; o < x.length; o += 1024) parts.push(...r.push(x.subarray(o, o + 1024)))
    expect(parts.length).toBe(whole.length)
    parts.forEach((v, k) => expect(v).toBeCloseTo(whole[k], 5))
  })

  it('produces the expected number of samples at 44.1 kHz', () => {
    const out = new Resampler(44100, 3200).push(tone(650, 44100, 2))
    expect(Math.abs(out.length - 6400)).toBeLessThan(40)
  })
})
