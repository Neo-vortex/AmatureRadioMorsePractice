import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../rng'
import { generateWords } from './words'

const WORDS = ['I', 'THE', 'AND', 'HOUSE', 'BEAUTIFUL', 'A', 'CAT']

describe('generateWords', () => {
  it('draws count words from the top maxRank within the length range', () => {
    const text = generateWords(mulberry32(1), WORDS, { count: 20, maxRank: 5, minLen: 2, maxLen: 5 })
    const words = text.split(' ')
    expect(words).toHaveLength(20)
    for (const w of words) expect(['THE', 'AND', 'HOUSE']).toContain(w)
  })

  it('is deterministic', () => {
    const o = { count: 5, maxRank: 7, minLen: 1, maxLen: 9 }
    expect(generateWords(mulberry32(3), WORDS, o)).toBe(generateWords(mulberry32(3), WORDS, o))
  })

  it('throws when no word qualifies', () => {
    expect(() => generateWords(mulberry32(1), WORDS, { count: 1, maxRank: 2, minLen: 6, maxLen: 9 })).toThrow(/no words/)
  })
})
