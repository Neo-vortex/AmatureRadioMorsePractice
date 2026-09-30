import { readFileSync } from 'node:fs'
import * as ort from 'onnxruntime-web'
import { beforeAll, describe, expect, it } from 'vitest'
import { charErrorRate } from '../testing/cer'
import { synthCw, type SynthOptions } from '../testing/synth'
import { DeepCwEngine, type RunModel } from './engine'
import { validateMeta } from './metadata'

const DIR = 'public/models/deepcw'
const TEXT = 'CQ CQ DE DL1ABC DL1ABC K'
const meta = validateMeta(JSON.parse(readFileSync(`${DIR}/model.onnx.json`, 'utf8')))
let run: RunModel

beforeAll(async () => {
  ort.env.wasm.numThreads = 1
  const session = await ort.InferenceSession.create(readFileSync(`${DIR}/model.onnx`))
  run = async (input, frames, bins) => {
    const out = await session.run({ [meta.onnx_input_name]: new ort.Tensor('float32', input, [1, 1, frames, bins]) })
    return out[meta.onnx_output_name].data as Float32Array
  }
})

/** Streams synthetic audio in 20 ms chunks, re-decoding whenever the engine is ready. */
async function decode(o: Omit<SynthOptions, 'text'> & { text?: string }) {
  const s = synthCw({ text: TEXT, ...o })
  const engine = new DeepCwEngine(meta, run, o.sampleRate)
  const chunk = Math.round(o.sampleRate * 0.02)
  let committed = ''
  let pending = ''
  let pitchHz: number | null = null
  let lastWordAt = Infinity
  for (let at = 0; at < s.audio.length; at += chunk) {
    engine.push(s.audio.subarray(at, at + chunk))
    const u = await engine.step()
    if (!u) continue
    committed += u.committed
    pending = u.pending
    pitchHz = u.pitchHz ?? pitchHz
    if (lastWordAt === Infinity && (committed + pending).includes('DL1ABC K')) lastWordAt = (at + chunk) / o.sampleRate
  }
  return { committed, text: (committed + pending).trim(), delay: lastWordAt - (s.charEnds.at(-1)?.t ?? 0), pitchHz }
}

describe('DeepCwEngine', { timeout: 60_000 }, () => {
  it.each([0, -6])('decodes a CQ call at %i dB SNR within 3 s', async (snrDb) => {
    const r = await decode({ sampleRate: 48000, wpm: 20, snrDb })
    expect(charErrorRate(TEXT, r.text)).toBeLessThanOrEqual(0.1)
    expect(r.delay).toBeLessThan(3)
    expect(r.committed.startsWith('CQ CQ DE DL1ABC')).toBe(true)
    expect(r.pitchHz).toBeGreaterThan(600)
    expect(r.pitchHz).toBeLessThan(700)
  })

  it('works at 44.1 kHz', async () => {
    const r = await decode({ sampleRate: 44100, wpm: 25, snrDb: 6 })
    expect(r.text).toContain('DL1ABC DL1ABC K')
  })

  it('writes nothing for noise alone', async () => {
    const r = await decode({ text: '', sampleRate: 48000, wpm: 20, snrDb: 0, tail: 10 })
    expect(r.text).toBe('')
  })
})
