import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { binRange, validateMeta } from './metadata'

const raw = JSON.parse(readFileSync('public/models/deepcw/model.onnx.json', 'utf8'))

describe('DeepCW metadata', () => {
  it('accepts the shipped model and finds the 400–1200 Hz bins', () => {
    const m = validateMeta(raw)
    expect(binRange(m)).toEqual({ start: 32, stop: 97 })
  })

  it('rejects metadata this code cannot reproduce', () => {
    expect(() => validateMeta({ ...raw, spectrogram_frequency_bins: 64 })).toThrow(/frequency bins/)
    expect(() => validateMeta({ ...raw, normalization: 'db' })).toThrow(/normalization/)
    expect(() => validateMeta(null)).toThrow()
  })
})
