import { describe, expect, it } from 'vitest'
import { chunk, cleanWordList, EXTRA_BLOCKLIST, isBlocked, normalizeSentence, selectSentences, sentenceLevel, sentenceWords } from './clean.ts'

describe('normalizeSentence', () => {
  it('uppercases, drops apostrophes and turns ! into .', () => {
    expect(normalizeSentence("Don't do that!")).toBe('DONT DO THAT.')
    expect(normalizeSentence('It’s 5 o’clock, Tom.')).toBe('ITS 5 OCLOCK, TOM.')
  })
  it('collapses whitespace', () => {
    expect(normalizeSentence('  I   am\there. ')).toBe('I AM HERE.')
  })
  it('rejects characters Morse cannot send and bad lengths', () => {
    expect(normalizeSentence('He said "hi" to me.')).toBeNull()
    expect(normalizeSentence('Café is open now.')).toBeNull()
    expect(normalizeSentence('Hi.')).toBeNull()
    expect(normalizeSentence('A'.repeat(81))).toBeNull()
  })
})

describe('sentenceWords', () => {
  it('extracts letter-only words', () => {
    expect(sentenceWords('I HAVE 2 CATS, TOM.')).toEqual(['I', 'HAVE', 'CATS', 'TOM'])
  })
})

describe('cleanWordList', () => {
  it('keeps letter words in rank order, drops fragments, blocklisted and duplicate words', () => {
    const lines = ['you 50', "'s 40", 'don 30', 'i 20', 'x 10', 'badword 9', 'hello 8', 'hello 7', 'a 6', '']
    expect(cleanWordList(lines, new Set(['badword']))).toEqual(['you', 'i', 'hello', 'a'])
  })
})

describe('sentenceLevel', () => {
  const rank = new Map([['I', 0], ['AM', 1], ['HERE', 2], ['EXTRAORDINARY', 5000], ['OBSCURE', 20000]])
  const level = (s: string) => sentenceLevel(s, sentenceWords(s), rank)
  it('buckets by length and rarest word', () => {
    expect(level('I AM HERE.')).toBe('easy')
    expect(level('I AM EXTRAORDINARY.')).toBe('medium')
    expect(level('I AM OBSCURE.')).toBe('hard')
    expect(level('I AM HERE I AM HERE I AM HERE I AM HERE I AM HERE I AM HERE.')).toBe('hard')
  })
  it('rejects sentences with unknown words', () => {
    expect(level('I AM ZORBLAX.')).toBeNull()
  })
})

describe('selectSentences', () => {
  const rank = new Map([['I', 0], ['AM', 1], ['HERE', 2], ['BAD', 3], ['YOU', 4], ['ARE', 5], ['TOO', 6]])
  const input = ['I AM HERE.', 'I AM HERE.', 'YOU ARE HERE.', 'YOU ARE TOO.', 'I AM BAD.', 'I AM ZORBLAX.']
  it('dedupes, drops offensive and unknown-word sentences, caps per level, is deterministic', () => {
    const a = selectSentences(input, rank, new Set(['bad']), 2, 1)
    expect(a.easy).toHaveLength(2)
    expect(new Set(a.easy).size).toBe(2)
    expect(a.easy.every((s) => ['I AM HERE.', 'YOU ARE HERE.', 'YOU ARE TOO.'].includes(s))).toBe(true)
    expect(a.medium).toEqual([])
    expect(selectSentences(input, rank, new Set(['bad']), 2, 1)).toEqual(a)
  })
})

describe('chunk', () => {
  it('splits into fixed-size pieces', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})

describe('isBlocked', () => {
  it('catches blocklisted words and their simple plurals, any case', () => {
    const block = new Set(['ass', 'damn'])
    for (const w of ['ass', 'ASSES', 'damns', 'Damn']) expect(isBlocked(w, block), w).toBe(true)
    for (const w of ['assess', 'class', 'dam']) expect(isBlocked(w, block), w).toBe(false)
  })
})

describe('review fixes', () => {
  it('cleans garbled punctuation and requires a sentence ending', () => {
    expect(normalizeSentence('What am I doing?!')).toBe('WHAT AM I DOING?')
    expect(normalizeSentence('Well... I am not sure.')).toBe('WELL. I AM NOT SURE.')
    expect(normalizeSentence('Come back here right now !')).toBe('COME BACK HERE RIGHT NOW.')
    expect(normalizeSentence('I like apples , pears')).toBeNull()
  })

  it('the extra blocklist catches slurs the base list misses', () => {
    for (const w of ['retarded', 'JAPS', 'gook', 'raped', 'homos']) expect(isBlocked(w, EXTRA_BLOCKLIST), w).toBe(true)
  })

  it('drops sentences from the Sami/Layla crime series', () => {
    const rank = new Map([['SAMI', 0], ['LAYLA', 1], ['IS', 2], ['HERE', 3], ['TOM', 4]])
    const out = selectSentences(['SAMI IS HERE.', 'LAYLA IS HERE.', 'TOM IS HERE.'], rank, new Set(), 10, 1)
    expect(out.easy).toEqual(['TOM IS HERE.'])
  })
})
