import { describe, expect, it } from 'vitest'
import { mulberry32, newSeed, pick, randInt } from './rng'

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const xs = Array.from({ length: 5 }, () => a())
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs)
  })

  it('differs between seeds and stays in [0, 1)', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    expect(a()).not.toEqual(b())
    const r = mulberry32(7)
    for (let k = 0; k < 10_000; k++) {
      const x = r()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  it('randInt covers the inclusive range', () => {
    const r = mulberry32(3)
    const seen = new Set<number>()
    for (let k = 0; k < 1000; k++) seen.add(randInt(r, 2, 5))
    expect([...seen].sort()).toEqual([2, 3, 4, 5])
  })

  it('pick returns items from the list', () => {
    const r = mulberry32(9)
    for (let k = 0; k < 100; k++) expect(['a', 'b', 'c']).toContain(pick(r, ['a', 'b', 'c']))
  })

  it('newSeed returns a 32-bit unsigned integer', () => {
    const s = newSeed()
    expect(Number.isInteger(s)).toBe(true)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThan(2 ** 32)
  })
})
