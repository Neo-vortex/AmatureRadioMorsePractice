import { describe, expect, it } from 'vitest'
import { PRESETS } from './conditions'
import { planQrm } from './qrm'
import { poissonTimes } from './dsp'
import { impairmentStreams } from './streams'

describe('impairmentStreams', () => {
  it('gives each impairment its own stream, so the noise buffer size (sample rate) cannot shift the plan', () => {
    const plan = (noiseSamples: number) => {
      const s = impairmentStreams(123)
      for (let k = 0; k < noiseSamples; k++) s.noise()
      for (let k = 0; k < noiseSamples / 10; k++) s.crash()
      return { crashes: poissonTimes(s.qrn, 60, 12), qrm: planQrm(s.qrm, PRESETS.poor.qrm, 10), fist: s.fist(), qsb: s.qsb() }
    }
    expect(plan(22050 * 2)).toEqual(plan(48000 * 2))
  })

  it('is deterministic per seed and differs between seeds', () => {
    expect(impairmentStreams(1).qrm()).toBe(impairmentStreams(1).qrm())
    expect(impairmentStreams(1).qrm()).not.toBe(impairmentStreams(2).qrm())
  })
})
