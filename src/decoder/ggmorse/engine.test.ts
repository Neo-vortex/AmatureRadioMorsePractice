import { describe, expect, it } from 'vitest'
import { charErrorRate } from '../testing/cer'
import { synthCw, type SynthOptions } from '../testing/synth'
import { GgmorseEngine } from './engine'
import createGgmorse from './ggmorse.mjs'

const TEXT = 'CQ CQ DE DL1ABC DL1ABC K'
const quiet = { print: () => {}, printErr: () => {} }

/** Streams synthetic audio through the engine in 20 ms chunks, like the microphone tap. */
async function decode(o: Omit<SynthOptions, 'text'> & { text?: string }) {
  const s = synthCw({ text: TEXT, ...o })
  const engine = new GgmorseEngine(await createGgmorse(quiet), o.sampleRate)
  const chunk = Math.round(o.sampleRate * 0.02)
  let text = ''
  let lastWordAt = Infinity
  let pitchHz: number | null = null
  for (let at = 0; at < s.audio.length; at += chunk) {
    engine.push(s.audio.subarray(at, at + chunk))
    const u = engine.take()
    text += u.committed
    pitchHz = u.pitchHz ?? pitchHz
    if (lastWordAt === Infinity && text.includes('DL1ABC K')) lastWordAt = (at + chunk) / o.sampleRate
  }
  engine.destroy()
  return { text: text.trim(), delay: lastWordAt - (s.charEnds.at(-1)?.t ?? 0), pitchHz }
}

describe('GgmorseEngine', () => {
  it.each([
    [48000, 20, 0],
    [48000, 30, 0],
    [44100, 20, 6],
  ])('decodes a CQ call at %i Hz, %i WPM, %i dB SNR within 3 s', async (sampleRate, wpm, snrDb) => {
    const r = await decode({ sampleRate, wpm, snrDb })
    expect(r.text).toContain('DL1ABC DL1ABC K')
    expect(charErrorRate(TEXT, r.text)).toBeLessThanOrEqual(0.15)
    expect(r.delay).toBeLessThan(3)
    expect(r.pitchHz).toBeGreaterThan(600)
    expect(r.pitchHz).toBeLessThan(700)
  })

  it('prints nothing for noise alone', async () => {
    const r = await decode({ text: '', sampleRate: 48000, wpm: 20, snrDb: 0, tail: 10 })
    expect(r.text).toBe('')
  })
})
