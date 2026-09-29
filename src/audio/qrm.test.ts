import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../content/rng'
import { isLosslessMorse } from '../content/testing'
import { planQrm } from './qrm'

describe('planQrm', () => {
  it('plans the requested stations around the signal', () => {
    const plan = planQrm(mulberry32(1), { stations: 3, levelDb: -6, maxOffsetHz: 300 }, 10)
    expect(plan).toHaveLength(3)
    for (const s of plan) {
      expect(Math.abs(s.offsetHz)).toBeGreaterThanOrEqual(50)
      expect(Math.abs(s.offsetHz)).toBeLessThanOrEqual(300)
      expect(s.wpm).toBeGreaterThanOrEqual(15)
      expect(s.wpm).toBeLessThanOrEqual(35)
      expect(s.gainDb).toBeGreaterThanOrEqual(-9)
      expect(s.gainDb).toBeLessThanOrEqual(-3)
      expect(s.startDelay).toBeGreaterThanOrEqual(0)
      expect(s.startDelay).toBeLessThanOrEqual(5)
      expect(isLosslessMorse(s.text)).toBe(true)
    }
    expect(planQrm(mulberry32(1), { stations: 0, levelDb: -6, maxOffsetHz: 300 }, 10)).toEqual([])
  })
})
