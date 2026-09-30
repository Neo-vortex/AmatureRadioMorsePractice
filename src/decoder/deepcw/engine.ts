import type { DecoderUpdate } from '../types'
import { greedyCtc } from './ctc'
import { binRange, type DeepCwMeta } from './metadata'
import { Resampler } from './resample'
import { spectrogram, type Spectrogram } from './spectrogram'
import { planCommit } from './stream'

/** Runs the model: spectrogram (frames × bins) in, log-probabilities (frames × classes) out. */
export type RunModel = (input: Float32Array, frames: number, bins: number) => Promise<Float32Array>

/** Re-decode once this much new audio has arrived. */
const MIN_NEW_SECONDS = 0.25
/** Text this close to the newest audio may still change. */
const GUARD_SECONDS = 1.25
/** Rolling window: longer windows are slower to decode (10 s ≈ 0.25 s on one thread). */
const MAX_SECONDS = 10
/** Startup: pad short buffers with silence. */
const MIN_WINDOW_SECONDS = 2
/**
 * Already-final audio kept in front of the live part: a window that starts abruptly (after a
 * cut) makes the model hear a dit at its edge. Characters inside the context are ignored.
 */
const CONTEXT_SECONDS = 1

/**
 * Streams DeepCW, a whole-window model: the buffer since the last final word is decoded
 * again and again; words become final once they are older than the guard.
 */
export class DeepCwEngine {
  private readonly meta: DeepCwMeta
  private readonly run: RunModel
  private readonly resampler: Resampler
  /** Context audio followed by live (not yet final) audio. */
  private buffer = new Float32Array(0)
  /** Where the live audio starts in `buffer`. */
  private live = 0
  private fresh = 0
  private lastWasSpace = true

  constructor(meta: DeepCwMeta, run: RunModel, inputRate: number) {
    this.meta = meta
    this.run = run
    this.resampler = new Resampler(inputRate, meta.sample_rate)
  }

  push(samples: Float32Array): void {
    const r = this.resampler.push(samples)
    const next = new Float32Array(this.buffer.length + r.length)
    next.set(this.buffer)
    next.set(r, this.buffer.length)
    this.buffer = next
    this.fresh += r.length
  }

  /** Decodes if enough new audio arrived, else returns null. Not re-entrant: await each call. */
  async step(): Promise<DecoderUpdate | null> {
    const m = this.meta
    const sr = m.sample_rate
    if (this.fresh < MIN_NEW_SECONDS * sr) return null
    this.fresh = 0
    // push() replaces the buffer, so this snapshot stays valid while the model runs.
    const audio = this.buffer
    const live = this.live
    // The window starts `lead` frames before the live audio (context and/or startup silence).
    const lead = Math.ceil(Math.max(live, MIN_WINDOW_SECONDS * sr - (audio.length - live)) / m.hop_length)
    const pad = lead * m.hop_length - live
    const input = pad > 0 ? new Float32Array(pad + audio.length) : audio
    if (pad > 0) input.set(audio, pad)
    const spec = spectrogram(input, m)
    const logProbs = await this.run(spec.data, spec.frames, spec.bins)
    const spans = greedyCtc(logProbs, spec.frames, m.num_classes, m.chars, m.blank_index)
      .map((s) => ({ ...s, startFrame: s.startFrame - lead, endFrame: s.endFrame - lead }))
      .filter((s) => s.endFrame >= 0)
    const plan = planCommit(spans, audio.length - live, {
      hop: m.hop_length,
      guardSamples: GUARD_SECONDS * sr,
      maxSamples: MAX_SECONDS * sr,
    })
    const liveStart = live + plan.cut
    const keepFrom = Math.max(0, liveStart - CONTEXT_SECONDS * sr)
    this.buffer = this.buffer.slice(keepFrom)
    this.live = liveStart - keepFrom
    const committed = this.tidy(plan.committed)
    const pending = plan.pending.replace(/ +/g, ' ')
    return {
      committed,
      pending: this.lastWasSpace ? pending.trimStart() : pending,
      pitchHz: spans.some((s) => s.char !== ' ') ? this.pitch(spec) : null,
      wpm: null,
    }
  }

  /** Collapses spaces, also across updates. */
  private tidy(text: string): string {
    let out = ''
    for (const ch of text) {
      const space = ch === ' '
      if (space && this.lastWasSpace) continue
      out += ch
      this.lastWasSpace = space
    }
    return out
  }

  /** The loudest bin over the window: a tone stands above the flat noise. */
  private pitch(spec: Spectrogram): number {
    const sums = new Float64Array(spec.bins)
    for (let f = 0; f < spec.frames; f++) for (let b = 0; b < spec.bins; b++) sums[b] += spec.data[f * spec.bins + b]
    let best = 0
    for (let b = 1; b < spec.bins; b++) if (sums[b] > sums[best]) best = b
    return (binRange(this.meta).start + best) * (this.meta.sample_rate / this.meta.fft_length)
  }
}
