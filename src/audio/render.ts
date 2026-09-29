import { encodeTokens } from '../morse/encoder'
import { tokenize } from '../morse/table'
import { buildGraph, type GraphOptions } from './graph'
import { encodeWav } from './wav'

const SAMPLE_RATE = 22050
const LEAD = 0.3

/** Renders an exercise (with all impairments) offline to a WAV file. */
export async function renderWav(o: GraphOptions): Promise<Blob> {
  const clean = encodeTokens(tokenize(o.text), o.timing).duration
  const f = o.conditions.fist
  const seconds = LEAD + clean * (1 + f.jitter) * (1 + f.speedDrift) + LEAD
  const ctx = new OfflineAudioContext(1, Math.ceil(SAMPLE_RATE * seconds), SAMPLE_RATE)
  buildGraph(ctx, ctx.destination, o, LEAD)
  const audio = await ctx.startRendering()
  return new Blob([encodeWav(audio.getChannelData(0), SAMPLE_RATE)], { type: 'audio/wav' })
}
