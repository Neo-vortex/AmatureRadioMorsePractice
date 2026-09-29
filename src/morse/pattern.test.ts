import { describe, expect, it } from 'vitest'
import { expectedPatterns, MORSE_CHART, normalizeMorseInput, parseMorseInput, patternToText, toPattern, unsupportedChars } from './pattern'

describe('parseMorseInput', () => {
  it('reads letters separated by spaces and words by / or double spaces', () => {
    expect(parseMorseInput('.... ..  -.-. --.-')).toEqual(['....', '..', ' ', '-.-.', '--.-'])
    expect(parseMorseInput(' .... .. / -.-. ')).toEqual(['....', '..', ' ', '-.-.'])
    expect(parseMorseInput('')).toEqual([])
  })
  it('accepts look-alike dot and dash characters', () => {
    expect(normalizeMorseInput('·•_—–−')).toBe('..----')
    expect(parseMorseInput('·− −···')).toEqual(['.-', '-...'])
  })
})

describe('expectedPatterns', () => {
  it('turns text into patterns with word separators', () => {
    expect(expectedPatterns('Hi 73')).toEqual(['....', '..', ' ', '--...', '...--'])
  })
})

describe('patternToText', () => {
  it('decodes patterns, preferring plain characters, marking unknown ones', () => {
    expect(patternToText('.-')).toBe('A')
    expect(patternToText('.-.-.')).toBe('+')
    expect(patternToText('........')).toBe('■')
  })
})

describe('toPattern / unsupportedChars / chart', () => {
  it('groups characters by word', () => {
    expect(toPattern('Hi <AR>')).toEqual([
      [{ token: 'H', pattern: '....' }, { token: 'I', pattern: '..' }],
      [{ token: '<AR>', pattern: '.-.-.' }],
    ])
  })
  it('lists characters Morse cannot send', () => {
    expect(unsupportedChars("Don't panic! Don't!")).toEqual(["'", '!'])
  })
  it('the chart covers letters, digits, punctuation and prosigns', () => {
    expect(MORSE_CHART).toHaveLength(26 + 10 + 7 + 4)
  })
})
