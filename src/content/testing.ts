import { tokenize } from '../morse/table'

/** True when every non-space character of `text` becomes a Morse token (nothing silently dropped). */
export function isLosslessMorse(text: string): boolean {
  return tokenize(text).filter((t) => t !== ' ').join('') === text.toUpperCase().replace(/\s+/g, '')
}
