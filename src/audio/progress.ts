import type { KeyEvent } from '../morse/encoder'

/** Token being keyed at `time`: from its first key-down to its last key-up. */
export function tokenAt(events: readonly KeyEvent[], time: number): number | null {
  let first = -1
  for (let k = 0; k < events.length; k++) {
    const e = events[k]
    if (k === 0 || events[k - 1].i !== e.i) first = k
    const isLast = k === events.length - 1 || events[k + 1].i !== e.i
    if (isLast && time >= events[first].t && time <= e.t) return e.i
  }
  return null
}
