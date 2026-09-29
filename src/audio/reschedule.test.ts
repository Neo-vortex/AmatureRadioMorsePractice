import { describe, expect, it } from 'vitest'
import { encode } from '../morse/encoder'
import { makeTiming } from '../morse/timing'
import { RAMP_SECONDS } from './envelope'
import { findRescheduleIndex, planHandoff, planReschedule } from './reschedule'

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

describe('planReschedule', () => {
  const slow = makeTiming({ charWpm: 18, effWpm: 5, extraWordGap: 0 })
  const fast = makeTiming({ charWpm: 18, effWpm: 18, extraWordGap: 0 })
  const { tokens, events: ev } = encode('E E', slow)
  // E at 0–0.067, then a ~3.66 s Farnsworth word gap before the second E.

  it('speeding up during a word gap moves the next character earlier', () => {
    const plan = planReschedule(ev, tokens, fast, 0.2)!
    expect(plan.keep).toBe(2)
    expect(plan.fromToken).toBe(2)
    expect(plan.at).toBeCloseTo(ev[1].t + fast.wordGap)
    expect(plan.at).toBeLessThan(ev[2].t)
  })

  it('never schedules before the cutoff when the new gap has already elapsed', () => {
    const plan = planReschedule(ev, tokens, fast, 1.0)!
    expect(plan.at).toBeCloseTo(1.0)
  })

  it('slowing down during a character gap pushes the next character later', () => {
    const e2 = encode('EE', fast)
    const plan = planReschedule(e2.events, e2.tokens, slow, 0.1)!
    expect(plan.at).toBeCloseTo(e2.events[1].t + slow.charGap)
    expect(plan.at).toBeGreaterThan(e2.events[2].t)
  })

  it('keeps the original start when nothing has played yet', () => {
    expect(planReschedule(ev, tokens, fast, -1)).toEqual({ keep: 0, fromToken: 0, at: 0 })
  })

  it('returns null when no character is left to re-time', () => {
    expect(planReschedule(ev, tokens, fast, 10)).toBeNull()
  })
})

describe('planHandoff', () => {
  const X = 0.02

  it('lets the character in progress finish before switching', () => {
    // Cutoff inside A: switch after A's last key-up, E starts after the normal gap.
    const plan = planHandoff(events, ['A', 'E'], t20, 0.2, X)!
    expect(plan.keep).toBe(4)
    expect(plan.fromToken).toBe(1)
    expect(plan.switchAt).toBeCloseTo(events[3].t + RAMP_SECONDS)
    expect(plan.at).toBeCloseTo(events[4].t)
  })

  it('switches right away during a gap', () => {
    const plan = planHandoff(events, ['A', 'E'], t20, 0.35, X)!
    expect(plan.switchAt).toBeCloseTo(0.35)
    expect(plan.at).toBeCloseTo(events[4].t)
  })

  it('leaves room for the crossfade before the next character', () => {
    const plan = planHandoff(events, ['A', 'E'], t20, 0.47, X)!
    expect(plan.switchAt).toBeCloseTo(0.47)
    expect(plan.at).toBeCloseTo(0.47 + X)
  })

  it('returns null when the last character is already keying', () => {
    expect(planHandoff(events, ['A', 'E'], t20, 0.5, X)).toBeNull()
  })
})
