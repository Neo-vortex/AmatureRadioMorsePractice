import { describe, expect, it } from 'vitest'
import { Squelch } from './squelch'
import { synthCw } from './testing/synth'

const SR = 8000

/** Feeds audio in 20 ms chunks; returns whether the squelch was open after each chunk. */
function run(sq: Squelch, audio: Float32Array): boolean[] {
  const open: boolean[] = []
  const chunk = SR / 50
  for (let o = 0; o < audio.length; o += chunk) {
    sq.push(audio.subarray(o, o + chunk))
    open.push(sq.isOpen())
  }
  return open
}
const at = (open: boolean[], seconds: number) => open[Math.round(seconds * 50) - 1]

describe('Squelch', () => {
  it('stays closed on noise alone', () => {
    const { audio } = synthCw({ text: '', wpm: 20, snrDb: 0, sampleRate: SR, lead: 0, tail: 10 })
    expect(run(new Squelch(SR), audio).some(Boolean)).toBe(false)
  })

  it('opens on CW at 0 dB and closes after the hold', () => {
    const s = synthCw({ text: 'CQ CQ', wpm: 20, snrDb: 0, sampleRate: SR, lead: 1, tail: 8 })
    const open = run(new Squelch(SR), s.audio)
    expect(at(open, 0.9)).toBe(false)
    expect(at(open, s.charEnds[1].t)).toBe(true)
    expect(at(open, s.end + 3)).toBe(true)
    expect(at(open, s.end + 5)).toBe(false)
  })

  it('closes at once when the decoder loses the pitch and no tone was just seen', () => {
    const s = synthCw({ text: 'CQ', wpm: 20, snrDb: 0, sampleRate: SR, lead: 1, tail: 3 })
    const sq = new Squelch(SR)
    run(sq, s.audio.subarray(0, Math.round((s.end + 1) * SR)))
    expect(sq.isOpen()).toBe(true)
    sq.pitchLost()
    expect(sq.isOpen()).toBe(false)
  })

  it('stays open when the pitch is lost while a tone is present', () => {
    const s = synthCw({ text: 'TTTT', wpm: 10, snrDb: 10, sampleRate: SR, lead: 1, tail: 1 })
    const sq = new Squelch(SR)
    run(sq, s.audio.subarray(0, Math.round(s.charEnds[1].t * SR)))
    sq.pitchLost()
    expect(sq.isOpen()).toBe(true)
  })
})
