import { describe, expect, it } from 'vitest'
import { encode, encodeTokens } from './encoder'
import { makeTiming } from './timing'

const t20 = makeTiming({ charWpm: 20, effWpm: 20, extraWordGap: 0 })
const U = 0.06

describe('encode', () => {
  it('encodes E as one dit', () => {
    const r = encode('E', t20)
    expect(r.events).toEqual([
      { down: true, t: 0, i: 0 },
      { down: false, t: expect.closeTo(U, 9), i: 0 },
    ])
    expect(r.duration).toBeCloseTo(U)
  })

  it('makes PARIS 43 units of sound+gaps and PARIS+space exactly 50 units', () => {
    const r = encode('PARIS PARIS', t20)
    const firstWordEnd = r.events.filter((e) => e.i <= 4).at(-1)!
    expect(firstWordEnd.t).toBeCloseTo(43 * U)
    const secondP = r.events.find((e) => e.i === 6)!
    expect(secondP.down).toBe(true)
    expect(secondP.t).toBeCloseTo(50 * U)
  })

  it('hits the effective speed exactly with Farnsworth timing', () => {
    const t = makeTiming({ charWpm: 18, effWpm: 5, extraWordGap: 0 })
    const secondP = encode('PARIS PARIS', t).events.find((e) => e.i === 6)!
    expect(secondP.t).toBeCloseTo(60 / 5)
  })

  it('alternates down/up events and tags every event with its token index', () => {
    const r = encode('AB', t20)
    expect(r.events.map((e) => e.down)).toEqual([true, false, true, false, true, false, true, false, true, false, true, false])
    expect(r.events.map((e) => e.i)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1])
  })

  it('returns no events for empty text', () => {
    expect(encode('', t20)).toEqual({ tokens: [], events: [], duration: 0 })
  })
})

describe('encodeTokens', () => {
  it('ignores leading word separators', () => {
    const r = encodeTokens([' ', 'E'], t20)
    expect(r.events[0]).toEqual({ down: true, t: 0, i: 1 })
  })
})
