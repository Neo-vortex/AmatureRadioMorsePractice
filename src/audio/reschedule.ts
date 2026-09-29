import type { KeyEvent } from '../morse/encoder'
import type { Timing } from '../morse/timing'
import { RAMP_SECONDS } from './envelope'

/**
 * Where a speed change can take over: the first key-down that begins a new token
 * after `cutoff`. Characters already started finish at the old speed.
 */
export function findRescheduleIndex(events: readonly KeyEvent[], cutoff: number): number {
  return events.findIndex((e, k) => e.down && e.t > cutoff && (k === 0 || events[k - 1].i !== e.i))
}

export interface ReschedulePlan {
  /** Number of already-scheduled events to keep. */
  keep: number
  /** Token index the re-timed remainder starts from. */
  fromToken: number
  /** Time the remainder's first key-down starts. */
  at: number
}

/**
 * Plans a speed change: the gap before the next character is re-timed too, so speeding up
 * during a long (Farnsworth) gap takes effect immediately instead of after the gap.
 */
export function planReschedule(
  events: readonly KeyEvent[],
  tokens: readonly string[],
  timing: Timing,
  cutoff: number,
): ReschedulePlan | null {
  const k = findRescheduleIndex(events, cutoff)
  if (k < 0) return null
  const fromToken = events[k].i
  if (k === 0) return { keep: 0, fromToken, at: events[0].t }
  const prevUp = events[k - 1].t
  const wordBreak = tokens.slice(events[k - 1].i + 1, fromToken).includes(' ')
  const gap = wordBreak ? timing.wordGap : timing.charGap
  return { keep: k, fromToken, at: Math.max(prevUp + gap, cutoff) }
}

export interface HandoffPlan extends ReschedulePlan {
  /** When the old sound fades out and the new one fades in: after the character in progress. */
  switchAt: number
}

/**
 * Plans handing the rest of an item over to a new graph (e.g. new band conditions): the
 * character in progress finishes, the crossfade runs in the gap, then the next character starts.
 */
export function planHandoff(
  events: readonly KeyEvent[],
  tokens: readonly string[],
  timing: Timing,
  cutoff: number,
  crossfade: number,
): HandoffPlan | null {
  const plan = planReschedule(events, tokens, timing, cutoff)
  if (!plan) return null
  const switchAt = plan.keep > 0 ? Math.max(cutoff, events[plan.keep - 1].t + RAMP_SECONDS) : cutoff
  return { ...plan, switchAt, at: Math.max(plan.at, switchAt + crossfade) }
}
