/** The fields of model.onnx.json this code relies on. */
export interface DeepCwMeta {
  chars: string[]
  blank_index: number
  num_classes: number
  sample_rate: number
  fft_length: number
  hop_length: number
  spectrogram_min_freq_hz: number
  spectrogram_max_freq_hz: number
  spectrogram_frequency_bins: number
  normalization: string
  onnx_input_name: string
  onnx_output_name: string
}

/** FFT bins [start, stop) fed to the model. */
export function binRange(m: DeepCwMeta): { start: number; stop: number } {
  const binHz = m.sample_rate / m.fft_length
  return { start: Math.ceil(m.spectrogram_min_freq_hz / binHz), stop: Math.floor(m.spectrogram_max_freq_hz / binHz) + 1 }
}

/** Rejects metadata this code can't reproduce, instead of feeding the model garbage. */
export function validateMeta(raw: unknown): DeepCwMeta {
  if (typeof raw !== 'object' || raw === null) throw new Error('DeepCW model metadata is missing')
  const m = raw as DeepCwMeta
  const problems: string[] = []
  if (!Array.isArray(m.chars) || m.chars.length + 1 !== m.num_classes) problems.push('chars/num_classes')
  if (!(m.blank_index >= 0 && m.blank_index < m.num_classes)) problems.push('blank_index')
  if (m.normalization !== 'log1p') problems.push(`normalization ${String(m.normalization)}`)
  if (!(m.fft_length > 1) || (m.fft_length & (m.fft_length - 1)) !== 0) problems.push('fft_length')
  if (!(m.hop_length > 0) || !(m.sample_rate > 0)) problems.push('hop_length/sample_rate')
  if (typeof m.onnx_input_name !== 'string' || typeof m.onnx_output_name !== 'string') problems.push('onnx names')
  if (problems.length === 0) {
    const { start, stop } = binRange(m)
    if (stop - start !== m.spectrogram_frequency_bins) problems.push('frequency bins')
  }
  if (problems.length > 0) throw new Error(`Unsupported DeepCW model metadata: ${problems.join(', ')}`)
  return m
}
