import { describe, expect, it } from 'vitest'
import { makeTiming, unitSeconds } from './timing'

describe('timing', () => {
  it('uses the PARIS unit: 20 WPM → 60 ms', () => {
    expect(unitSeconds(20)).toBeCloseTo(0.06, 10)
  })

  it('uses standard spacing when effective speed equals character speed', () => {
    const t = makeTiming({ charWpm: 20, effWpm: 20, extraWordGap: 0 })
    expect(t.dit).toBeCloseTo(0.06)
    expect(t.dah).toBeCloseTo(0.18)
    expect(t.elementGap).toBeCloseTo(0.06)
    expect(t.charGap).toBeCloseTo(0.18)
    expect(t.wordGap).toBeCloseTo(0.42)
  })

  it('stretches gaps with the ARRL Farnsworth formula', () => {
    const t = makeTiming({ charWpm: 18, effWpm: 5, extraWordGap: 0 })
    const ta = (60 * 18 - 37.2 * 5) / (5 * 18)
    expect(t.dit).toBeCloseTo(1.2 / 18)
    expect(t.charGap).toBeCloseTo((3 * ta) / 19)
    expect(t.wordGap).toBeCloseTo((7 * ta) / 19)
  })

  it('treats an effective speed above character speed as equal', () => {
    const t = makeTiming({ charWpm: 20, effWpm: 30, extraWordGap: 0 })
    expect(t.charGap).toBeCloseTo(0.18)
  })

  it('adds extra word gap as a multiple of the word gap', () => {
    const t = makeTiming({ charWpm: 20, effWpm: 20, extraWordGap: 1 })
    expect(t.wordGap).toBeCloseTo(0.84)
  })
})
