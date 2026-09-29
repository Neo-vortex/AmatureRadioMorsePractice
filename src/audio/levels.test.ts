import { describe, expect, it } from 'vitest'
import { mixLevels } from './levels'

const SINE_RMS = Math.SQRT1_2
const power = (l: { signalGain: number; noiseGain: number }) => (l.signalGain * SINE_RMS) ** 2 + l.noiseGain ** 2

describe('mixLevels', () => {
  it('keeps signal+noise power constant as SNR drops (no loudness jump)', () => {
    const ref = power(mixLevels(30, true))
    for (const snr of [20, 10, 0, -10]) expect(power(mixLevels(snr, true))).toBeCloseTo(ref, 5)
  })

  it('realizes the requested SNR between signal and noise', () => {
    const l = mixLevels(-10, true)
    expect(20 * Math.log10((l.signalGain * SINE_RMS) / l.noiseGain)).toBeCloseTo(-10, 5)
  })

  it('leaves the signal at full level without noise', () => {
    expect(mixLevels(-10, false)).toEqual({ signalGain: 1, noiseGain: 0 })
  })
})
