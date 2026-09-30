import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../content/rng'
import { validateMeta, type DeepCwMeta } from './metadata'
import { spectrogram } from './spectrogram'

const meta = validateMeta(JSON.parse(readFileSync('public/models/deepcw/model.onnx.json', 'utf8')))

/** audioToSpectrogram from the DeepCW reference example (examples/nodejs/decode_morse.mjs), direct DFT. */
function reference(audio: Float32Array, m: DeepCwMeta): Float32Array {
  const fftLength = m.fft_length
  const binHz = m.sample_rate / fftLength
  const startBin = Math.ceil(m.spectrogram_min_freq_hz / binHz)
  const stopBin = Math.floor(m.spectrogram_max_freq_hz / binHz) + 1
  const bins = stopBin - startBin
  const pad = Math.floor(fftLength / 2)
  const padded = new Float32Array(audio.length + pad * 2)
  for (let i = 0; i < pad; i += 1) {
    padded[i] = audio[pad - i]
    padded[pad + audio.length + i] = audio[audio.length - 2 - i]
  }
  padded.set(audio, pad)
  const frames = 1 + Math.floor((padded.length - fftLength) / m.hop_length)
  const out = new Float32Array(frames * bins)
  for (let f = 0; f < frames; f++) {
    for (let bin = startBin; bin < stopBin; bin++) {
      let re = 0
      let im = 0
      for (let n = 0; n < fftLength; n++) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / fftLength)
        const angle = (-2 * Math.PI * bin * n) / fftLength
        re += padded[f * m.hop_length + n] * w * Math.cos(angle)
        im += padded[f * m.hop_length + n] * w * Math.sin(angle)
      }
      out[f * bins + bin - startBin] = Math.log1p(Math.hypot(re, im))
    }
  }
  return out
}

describe('spectrogram', () => {
  it('matches the DeepCW reference implementation', () => {
    const rng = mulberry32(9)
    const audio = Float32Array.from({ length: 3200 }, () => rng() - 0.5)
    const got = spectrogram(audio, meta)
    const want = reference(audio, meta)
    expect(got.bins).toBe(65)
    expect(got.frames).toBe(1 + Math.floor(3200 / 48))
    expect(got.data.length).toBe(want.length)
    let worst = 0
    want.forEach((v, k) => (worst = Math.max(worst, Math.abs(v - got.data[k]))))
    expect(worst).toBeLessThan(1e-4)
  })
})
