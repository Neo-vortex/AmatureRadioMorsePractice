import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../rng'
import { isLosslessMorse } from '../testing'
import { generateQsoScript } from './qso'

describe('generateQsoScript', () => {
  it('is a deterministic, sendable, complete QSO between two stations', () => {
    const script = generateQsoScript(mulberry32(12))
    expect(generateQsoScript(mulberry32(12))).toEqual(script)
    expect(script.length).toBeGreaterThanOrEqual(5)
    for (const line of script) expect(isLosslessMorse(line), line).toBe(true)
    expect(script[0]).toMatch(/^CQ CQ CQ DE /)
    expect(script.at(-1)).toContain('<SK>')
    const caller = script[0].split(' ')[4]
    expect(script[1]).toContain(caller)
  })
})
