import type { KeyEvent } from '../morse/encoder'

/**
 * Where a speed change can take over: the first key-down that begins a new token
 * after `cutoff`. Characters already started finish at the old speed.
 */
export function findRescheduleIndex(events: readonly KeyEvent[], cutoff: number): number {
  return events.findIndex((e, k) => e.down && e.t > cutoff && (k === 0 || events[k - 1].i !== e.i))
}
