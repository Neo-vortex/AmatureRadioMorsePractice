import { describe, expect, it } from 'vitest'
import { DIGITS, LETTERS, MORSE, PROSIGNS, PUNCTUATION, tokenize } from './table'

describe('MORSE table', () => {
  it('covers every letter, digit, punctuation mark and prosign', () => {
    for (const c of [...LETTERS, ...DIGITS, ...PUNCTUATION, ...PROSIGNS]) {
      expect(MORSE[c], c).toMatch(/^[.-]+$/)
    }
  })

  it('has well-known codes', () => {
    expect(MORSE.A).toBe('.-')
    expect(MORSE.Q).toBe('--.-')
    expect(MORSE['0']).toBe('-----')
    expect(MORSE['?']).toBe('..--..')
    expect(MORSE['<SK>']).toBe('...-.-')
  })
})

describe('tokenize', () => {
  it('uppercases and splits into char and word tokens', () => {
    expect(tokenize('cq  de <AR>')).toEqual(['C', 'Q', ' ', 'D', 'E', ' ', '<AR>'])
  })

  it('drops unknown characters and trims spaces', () => {
    expect(tokenize(' a%b ')).toEqual(['A', 'B'])
  })

  it('treats an unknown <...> sequence as plain characters', () => {
    expect(tokenize('<ZZ>')).toEqual(['Z', 'Z'])
  })

  it('returns nothing for empty or all-unknown input', () => {
    expect(tokenize('')).toEqual([])
    expect(tokenize('  #%  ')).toEqual([])
  })
})
