import { describe, expect, it } from 'vitest'
import { charErrorRate } from './cer'
import { synthCw } from './synth'

describe('synthCw', () => {
  it('reports when each character ends, in order', () => {
    const s = synthCw({ text: 'AB C', wpm: 20, snrDb: Infinity, sampleRate: 8000 })
    expect(s.charEnds.map((c) => c.char)).toEqual(['A', 'B', 'C'])
    const t = s.charEnds.map((c) => c.t)
    expect(t[0]).toBeLessThan(t[1])
    expect(t[1]).toBeLessThan(t[2])
    expect(s.end).toBeCloseTo(t[2])
  })

  it('is silent before the first element without noise', () => {
    const s = synthCw({ text: 'E', wpm: 20, snrDb: Infinity, sampleRate: 8000, lead: 1 })
    expect(s.audio.subarray(0, 7900).every((v) => v === 0)).toBe(true)
    expect(Math.max(...s.audio)).toBeGreaterThan(0.1)
  })

  it('is deterministic for a seed', () => {
    const a = synthCw({ text: 'CQ', wpm: 20, snrDb: 0, sampleRate: 8000, seed: 3 })
    const b = synthCw({ text: 'CQ', wpm: 20, snrDb: 0, sampleRate: 8000, seed: 3 })
    expect(a.audio).toEqual(b.audio)
  })
})

describe('charErrorRate', () => {
  it('is 0 for identical text and counts edits per expected character', () => {
    expect(charErrorRate('CQ DE', 'CQ DE')).toBe(0)
    expect(charErrorRate('ABCD', 'ABXD')).toBe(0.25)
    expect(charErrorRate('ABCD', 'ABD')).toBe(0.25)
  })
})
