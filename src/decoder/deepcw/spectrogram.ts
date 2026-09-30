import { powerSpectrum } from '../fft'
import { binRange, type DeepCwMeta } from './metadata'

export interface Spectrogram {
  /** frames × bins, row-major. */
  data: Float32Array
  frames: number
  bins: number
}

/**
 * log1p-magnitude spectrogram exactly as DeepCW expects it (see its reference example):
 * periodic Hann, reflect padding of half a frame, frame f centred on sample f × hop.
 */
export function spectrogram(audio: Float32Array, m: DeepCwMeta): Spectrogram {
  const n = m.fft_length
  const hop = m.hop_length
  if (audio.length < n) throw new Error(`Need at least ${n} samples, got ${audio.length}`)
  const { start, stop } = binRange(m)
  const bins = stop - start
  const pad = n / 2
  const padded = new Float32Array(audio.length + 2 * pad)
  padded.set(audio, pad)
  for (let i = 0; i < pad; i++) {
    padded[i] = audio[pad - i]
    padded[pad + audio.length + i] = audio[audio.length - 2 - i]
  }
  const window = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n))
  const frames = 1 + Math.floor((padded.length - n) / hop)
  const data = new Float32Array(frames * bins)
  const frame = new Float64Array(n)
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < n; i++) frame[i] = padded[f * hop + i] * window[i]
    const power = powerSpectrum(frame)
    for (let b = 0; b < bins; b++) data[f * bins + b] = Math.log1p(Math.sqrt(power[start + b]))
  }
  return { data, frames, bins }
}
