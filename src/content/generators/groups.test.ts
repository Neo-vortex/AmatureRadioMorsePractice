import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../rng'
import { generateGroups } from './groups'

const opts = { charset: 'KMRSU', minLen: 2, maxLen: 4, count: 6 }

describe('generateGroups', () => {
  it('is deterministic for a seed', () => {
    expect(generateGroups(mulberry32(5), opts)).toBe(generateGroups(mulberry32(5), opts))
  })

  it('produces count groups within the length range using only the charset', () => {
    const text = generateGroups(mulberry32(11), opts)
    const groups = text.split(' ')
    expect(groups).toHaveLength(6)
    for (const g of groups) {
      expect(g.length).toBeGreaterThanOrEqual(2)
      expect(g.length).toBeLessThanOrEqual(4)
      expect(g).toMatch(/^[KMRSU]+$/)
    }
  })

  it('rejects invalid options', () => {
    const r = mulberry32(1)
    expect(() => generateGroups(r, { ...opts, charset: '' })).toThrow(/charset/)
    expect(() => generateGroups(r, { ...opts, charset: 'A#' })).toThrow(/charset/)
    expect(() => generateGroups(r, { ...opts, minLen: 5, maxLen: 2 })).toThrow(/length/)
    expect(() => generateGroups(r, { ...opts, count: 0 })).toThrow(/count/)
  })
})
