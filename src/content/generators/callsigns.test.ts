import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../rng'
import { isLosslessMorse } from '../testing'
import { CALLSIGN_PATTERN, generateCallsign } from './callsigns'

describe('generateCallsign', () => {
  it('produces valid, sendable callsigns with variety', () => {
    const rng = mulberry32(8)
    const calls = Array.from({ length: 2000 }, () => generateCallsign(rng))
    for (const c of calls) {
      expect(c).toMatch(CALLSIGN_PATTERN)
      expect(isLosslessMorse(c)).toBe(true)
    }
    expect(new Set(calls).size).toBeGreaterThan(1900)
    expect(calls.some((c) => c.endsWith('/P'))).toBe(true)
    expect(calls.some((c) => /^[KWN]/.test(c))).toBe(true)
    expect(calls.some((c) => c.startsWith('DL'))).toBe(true)
  })

  it('can exclude portable suffixes', () => {
    const rng = mulberry32(2)
    for (let k = 0; k < 500; k++) expect(generateCallsign(rng, false)).not.toContain('/')
  })
})
