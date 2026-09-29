import { describe, expect, it } from 'vitest'
import { CLEAN, isPresetName, normalizeConditions, PRESET_NAMES, PRESETS } from './conditions'

describe('conditions', () => {
  it('clean has every impairment off', () => {
    expect(CLEAN.noise.type).toBe('off')
    expect(CLEAN.bandwidthHz).toBe(0)
    expect(CLEAN.qsb.depthDb).toBe(0)
    expect(CLEAN.qrm.stations).toBe(0)
    expect(CLEAN.qrn.perMinute).toBe(0)
    expect(CLEAN.fist).toEqual({ jitter: 0, speedDrift: 0, chirpHz: 0, driftHz: 0 })
  })

  it('every preset is already normalized', () => {
    for (const name of PRESET_NAMES) expect(normalizeConditions(PRESETS[name]), name).toEqual(PRESETS[name])
  })

  it('poor conditions turns everything on', () => {
    const p = PRESETS.poor
    expect(p.noise.type).not.toBe('off')
    expect(p.qsb.depthDb).toBeGreaterThan(0)
    expect(p.qrm.stations).toBeGreaterThan(0)
    expect(p.qrn.perMinute).toBeGreaterThan(0)
    expect(p.fist.jitter).toBeGreaterThan(0)
  })

  it('normalizes junk to clean and clamps ranges', () => {
    expect(normalizeConditions(undefined)).toEqual(CLEAN)
    expect(normalizeConditions('x')).toEqual(CLEAN)
    const n = normalizeConditions({
      noise: { type: 'purple', snrDb: -99 },
      bandwidthHz: 333,
      qsb: { depthDb: 99, rateHz: 9 },
      qrm: { stations: 7.6, levelDb: 50, maxOffsetHz: 1 },
      qrn: { perMinute: 500, levelDb: -99 },
      fist: { jitter: 2, speedDrift: -1, chirpHz: 1000, driftHz: 'x' },
    })
    expect(n).toEqual({
      noise: { type: 'off', snrDb: -10 },
      bandwidthHz: 0,
      qsb: { depthDb: 30, rateHz: 0.5 },
      qrm: { stations: 3, levelDb: 6, maxOffsetHz: 50 },
      qrn: { perMinute: 60, levelDb: -30 },
      fist: { jitter: 0.3, speedDrift: 0, chirpHz: 100, driftHz: 0 },
    })
  })

  it('isPresetName', () => {
    expect(isPresetName('weak-dx')).toBe(true)
    expect(isPresetName('custom')).toBe(false)
  })
})
