import { describe, expect, it } from 'vitest'
import { encode } from '../morse/encoder'
import { makeTiming } from '../morse/timing'
import { findRescheduleIndex } from './reschedule'

const t20 = makeTiming({ charWpm: 20, effWpm: 20, extraWordGap: 0 })
// "AE" at 20 WPM: A = dit 0–0.06, dah 0.12–0.30; E = dit 0.48–0.54
const events = encode('AE', t20).events

describe('findRescheduleIndex', () => {
  it('returns the first token start after the cutoff', () => {
    expect(findRescheduleIndex(events, -1)).toBe(0)
    expect(findRescheduleIndex(events, 0.4)).toBe(4)
  })

  it('never splits a character: a cutoff inside A skips to E', () => {
    expect(findRescheduleIndex(events, 0.05)).toBe(4)
  })

  it('returns -1 when no token starts after the cutoff', () => {
    expect(findRescheduleIndex(events, 0.5)).toBe(-1)
    expect(findRescheduleIndex([], 0)).toBe(-1)
  })
})
