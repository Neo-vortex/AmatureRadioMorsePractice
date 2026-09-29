import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../rng'
import { isLosslessMorse } from '../testing'
import { ABBREVIATIONS, generateQcodes, QCODES } from './qcodes'

describe('qcodes', () => {
  it('every code is sendable and has a meaning', () => {
    for (const q of [...QCODES, ...ABBREVIATIONS]) {
      expect(isLosslessMorse(q.code), q.code).toBe(true)
      expect(q.meaning.length).toBeGreaterThan(0)
    }
  })
  it('generates count codes', () => {
    expect(generateQcodes(mulberry32(1), 5).split(' ')).toHaveLength(5)
  })
})
