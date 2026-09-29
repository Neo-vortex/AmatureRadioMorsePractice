import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../content/rng'
import { encode } from '../morse/encoder'
import { makeTiming } from '../morse/timing'
import { applyFist, crashBuffer, dbToGain, pinkNoise, poissonTimes, qsbCurve, rms, whiteNoise } from './dsp'

const lag1 = (x: Float32Array) => {
  let num = 0
  let den = 0
  for (let k = 1; k < x.length; k++) {
    num += x[k] * x[k - 1]
    den += x[k] * x[k]
  }
  return num / den
}

describe('noise', () => {
  it('white and pink noise have unit RMS and are deterministic', () => {
    for (const gen of [whiteNoise, pinkNoise]) {
      const a = gen(mulberry32(1), 44100)
      expect(rms(a)).toBeCloseTo(1, 1)
      expect(gen(mulberry32(1), 44100)).toEqual(a)
    }
  })

  it('pink noise is smoother (more low-frequency energy) than white', () => {
    expect(lag1(pinkNoise(mulberry32(2), 44100))).toBeGreaterThan(lag1(whiteNoise(mulberry32(2), 44100)) + 0.3)
  })

  it('crash bursts decay and stay within full scale', () => {
    const c = crashBuffer(mulberry32(3), 22050)
    expect(Math.max(...c.map(Math.abs))).toBeLessThanOrEqual(1)
    expect(rms(c, 0, 300)).toBeGreaterThan(rms(c, c.length - 300))
  })
})

describe('dbToGain', () => {
  it('converts decibels to amplitude', () => {
    expect(dbToGain(0)).toBe(1)
    expect(dbToGain(-20)).toBeCloseTo(0.1)
  })
})

describe('qsbCurve', () => {
  it('stays between -depth dB and 0 dB and really fades', () => {
    const c = qsbCurve(mulberry32(4), 30, 20, 0.2)
    expect(c.length).toBe(600)
    expect(Math.min(...c)).toBeGreaterThanOrEqual(dbToGain(-20) - 1e-6)
    expect(Math.max(...c)).toBeLessThanOrEqual(1 + 1e-6)
    expect(Math.max(...c) / Math.min(...c)).toBeGreaterThan(3)
  })
})

describe('poissonTimes', () => {
  it('is sorted, in range, and near the requested rate', () => {
    const t = poissonTimes(mulberry32(5), 600, 30)
    expect(t.length).toBeGreaterThan(240)
    expect(t.length).toBeLessThan(360)
    for (let k = 1; k < t.length; k++) expect(t[k]).toBeGreaterThan(t[k - 1])
    expect(t.at(-1)!).toBeLessThan(600)
    expect(poissonTimes(mulberry32(5), 600, 0)).toEqual([])
  })
})

describe('applyFist', () => {
  const events = encode('PARIS PARIS', makeTiming({ charWpm: 20, effWpm: 20, extraWordGap: 0 })).events

  it('returns the same timing when the fist is perfect', () => {
    expect(applyFist(events, { jitter: 0, speedDrift: 0 }, mulberry32(1))).toEqual(events)
  })

  it('jitters timing but keeps order, key states, token indexes and positive durations', () => {
    const out = applyFist(events, { jitter: 0.3, speedDrift: 0.2 }, mulberry32(1))
    expect(out.map((e) => [e.down, e.i])).toEqual(events.map((e) => [e.down, e.i]))
    expect(out[0].t).toBe(events[0].t)
    for (let k = 1; k < out.length; k++) expect(out[k].t).toBeGreaterThan(out[k - 1].t)
    expect(out.some((e, k) => Math.abs(e.t - events[k].t) > 0.001)).toBe(true)
  })
})
