import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../rng'
import { isLosslessMorse } from '../testing'
import { cutNumbers, generateContestExchange, generateNumberGroup, generateRst, generateSerial } from './numbers'

describe('numbers', () => {
  const rng = mulberry32(6)
  it('RST reports are realistic', () => {
    for (let k = 0; k < 200; k++) expect(generateRst(rng)).toMatch(/^[3-5][3-9]9$/)
  })
  it('serials are 001–999', () => {
    for (let k = 0; k < 200; k++) {
      const s = generateSerial(rng)
      expect(s).toMatch(/^\d{3}$/)
      expect(Number(s)).toBeGreaterThan(0)
    }
  })
  it('cut numbers replace 0 with T and 9 with N', () => {
    expect(cutNumbers('5990')).toBe('5NNT')
  })
  it('number groups have count entries of digits', () => {
    expect(generateNumberGroup(rng, 5)).toMatch(/^\d{1,4}( \d{1,4}){4}$/)
  })
  it('contest exchanges are call 5NN serial and sendable', () => {
    for (let k = 0; k < 200; k++) {
      const x = generateContestExchange(rng)
      expect(x).toMatch(/^[A-Z0-9]{1,3}[0-9][A-Z]{1,3} 5NN [0-9TN]{3}$/)
      expect(isLosslessMorse(x)).toBe(true)
    }
  })
})
