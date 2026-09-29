import { describe, expect, it } from 'vitest'
import { normalizeAnswer, score } from './scoring'

describe('score', () => {
  it('perfect copy', () => {
    const r = score('ABC', 'ABC')
    expect(r.accuracy).toBe(1)
    expect(r.ops).toEqual([
      { kind: 'match', char: 'A' },
      { kind: 'match', char: 'B' },
      { kind: 'match', char: 'C' },
    ])
  })

  it('substitution', () => {
    const r = score('ABC', 'AXC')
    expect(r.ops[1]).toEqual({ kind: 'sub', expected: 'B', typed: 'X' })
    expect(r.correct).toBe(2)
    expect(r.total).toBe(3)
  })

  it('missing character', () => {
    const r = score('ABC', 'AC')
    expect(r.ops).toEqual([
      { kind: 'match', char: 'A' },
      { kind: 'missing', expected: 'B' },
      { kind: 'match', char: 'C' },
    ])
    expect(r.accuracy).toBeCloseTo(2 / 3)
  })

  it('extra character counts against accuracy', () => {
    const r = score('ABC', 'ABXC')
    expect(r.ops[2]).toEqual({ kind: 'extra', typed: 'X' })
    expect(r.total).toBe(4)
    expect(r.accuracy).toBeCloseTo(3 / 4)
  })

  it('normalizes case and whitespace', () => {
    expect(score('CQ DE', '  cq   de ').accuracy).toBe(1)
  })

  it('handles empty inputs', () => {
    expect(score('', '').accuracy).toBe(1)
    expect(score('AB', '').accuracy).toBe(0)
    expect(score('', 'AB').accuracy).toBe(0)
  })
})

describe('normalizeAnswer', () => {
  it('uppercases, collapses and trims whitespace', () => {
    expect(normalizeAnswer(' a\t b  c ')).toBe('A B C')
  })
})
