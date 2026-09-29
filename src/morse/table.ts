export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const DIGITS = '0123456789'
export const PUNCTUATION = '.,?/=+-'
export const PROSIGNS: readonly string[] = ['<AR>', '<SK>', '<BT>', '<KN>']

export const MORSE: Readonly<Record<string, string>> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.',
  H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.',
  O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-',
  V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '=': '-...-',
  '+': '.-.-.', '-': '-....-',
  '<AR>': '.-.-.', '<SK>': '...-.-', '<BT>': '-...-', '<KN>': '-.--.',
}

/** Splits text into Morse tokens: single characters, prosigns like `<AR>`, and `' '` word separators. */
export function tokenize(text: string): string[] {
  const upper = text.toUpperCase()
  const tokens: string[] = []
  for (let k = 0; k < upper.length; k++) {
    const c = upper[k]
    if (/\s/.test(c)) {
      if (tokens.length > 0 && tokens[tokens.length - 1] !== ' ') tokens.push(' ')
      continue
    }
    if (c === '<') {
      const close = upper.indexOf('>', k)
      const prosign = close > k ? upper.slice(k, close + 1) : ''
      if (MORSE[prosign]) {
        tokens.push(prosign)
        k = close
        continue
      }
    }
    if (MORSE[c]) tokens.push(c)
  }
  if (tokens[tokens.length - 1] === ' ') tokens.pop()
  return tokens
}
