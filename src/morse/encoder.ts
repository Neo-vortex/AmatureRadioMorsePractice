import { MORSE, tokenize } from './table'
import type { Timing } from './timing'

export interface KeyEvent {
  down: boolean
  /** Seconds from the start of the transmission. */
  t: number
  /** Index of the token this event belongs to. */
  i: number
}

export interface Encoded {
  events: KeyEvent[]
  /** Time of the last key-up, in seconds. */
  duration: number
}

export function encodeTokens(tokens: readonly string[], timing: Timing): Encoded {
  const events: KeyEvent[] = []
  let t = 0
  let prev: 'none' | 'char' | 'word' = 'none'
  tokens.forEach((token, i) => {
    if (token === ' ') {
      if (prev === 'char') prev = 'word'
      return
    }
    // '#.-..' = a literal pattern (used to play back what the user wrote, even if invalid).
    const pattern = token.startsWith('#') ? token.slice(1) : MORSE[token]
    if (!pattern) return
    if (prev === 'char') t += timing.charGap
    else if (prev === 'word') t += timing.wordGap
    for (let k = 0; k < pattern.length; k++) {
      if (k > 0) t += timing.elementGap
      events.push({ down: true, t, i })
      t += pattern[k] === '.' ? timing.dit : timing.dah
      events.push({ down: false, t, i })
    }
    prev = 'char'
  })
  return { events, duration: t }
}

export function encode(text: string, timing: Timing): Encoded & { tokens: string[] } {
  const tokens = tokenize(text)
  return { tokens, ...encodeTokens(tokens, timing) }
}
