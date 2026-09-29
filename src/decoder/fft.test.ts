import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../content/rng'
import { powerSpectrum } from './fft'

function naive(x: number[]): number[] {
  const n = x.length
  return Array.from({ length: n / 2 + 1 }, (_, k) => {
    let re = 0
    let im = 0
    x.forEach((v, t) => {
      re += v * Math.cos((2 * Math.PI * k * t) / n)
      im -= v * Math.sin((2 * Math.PI * k * t) / n)
    })
    return re * re + im * im
  })
}

describe('powerSpectrum', () => {
  it('matches a direct DFT', () => {
    const rng = mulberry32(5)
    const x = Array.from({ length: 256 }, () => rng() - 0.5)
    const expected = naive(x)
    const got = powerSpectrum(x)
    expected.forEach((v, k) => expect(got[k]).toBeCloseTo(v, 6))
  })

  it('puts a sine in its bin', () => {
    const x = Array.from({ length: 64 }, (_, t) => Math.sin((2 * Math.PI * 5 * t) / 64))
    const p = powerSpectrum(x)
    expect(p.indexOf(Math.max(...p))).toBe(5)
  })

  it('rejects sizes that are not a power of two', () => {
    expect(() => powerSpectrum([1, 2, 3])).toThrow()
  })
})
