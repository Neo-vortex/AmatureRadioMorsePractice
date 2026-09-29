import { describe, expect, it } from 'vitest'
import { encode } from '../morse/encoder'
import { makeTiming } from '../morse/timing'
import { tokenAt } from './progress'

// "AE": A = 0–0.30 (token 0), E = 0.48–0.54 (token 1)
const { events } = encode('AE', makeTiming({ charWpm: 20, effWpm: 20, extraWordGap: 0 }))

describe('tokenAt', () => {
  it('finds the character being keyed, including gaps between its elements', () => {
    expect(tokenAt(events, 0.01)).toBe(0)
    expect(tokenAt(events, 0.09)).toBe(0)
    expect(tokenAt(events, 0.5)).toBe(1)
  })
  it('is null between characters, before the start and after the end', () => {
    expect(tokenAt(events, 0.4)).toBeNull()
    expect(tokenAt(events, -1)).toBeNull()
    expect(tokenAt(events, 1)).toBeNull()
  })
})
