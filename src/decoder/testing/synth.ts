import { mulberry32 } from '../../content/rng'
import { encode } from '../../morse/encoder'
import { makeTiming } from '../../morse/timing'

export interface SynthOptions {
  text: string
  wpm: number
  /** Signal-to-noise ratio in a 2500 Hz bandwidth (the usual CW convention); Infinity = no noise. */
  snrDb: number
  sampleRate: number
  pitchHz?: number
  /** Seconds before the first element and after the last one. */
  lead?: number
  tail?: number
  seed?: number
}

export interface Synth {
  audio: Float32Array
  /** When each sent character's last element ends (s), in order; spaces excluded. */
  charEnds: { char: string; t: number }[]
  /** Time of the last key-up (s). */
  end: number
}

const AMPLITUDE = 0.2
const RAMP = 0.005

/** Test signal: keyed sine with short ramps plus seeded white noise at a given SNR. */
export function synthCw(o: SynthOptions): Synth {
  const { sampleRate: sr, pitchHz = 650, lead = 2, tail = 4, seed = 1 } = o
  const { tokens, events } = encode(o.text, makeTiming({ charWpm: o.wpm, effWpm: o.wpm, extraWordGap: 0 }))
  const last = events.at(-1)?.t ?? 0
  const audio = new Float32Array(Math.ceil((lead + last + tail) * sr))
  for (let k = 0; k + 1 < events.length; k += 2) {
    const on = lead + events[k].t
    const off = lead + events[k + 1].t
    for (let n = Math.ceil(on * sr); n < off * sr; n++) {
      const t = n / sr
      audio[n] = AMPLITUDE * Math.min(1, (t - on) / RAMP, (off - t) / RAMP) * Math.sin(2 * Math.PI * pitchHz * t)
    }
  }
  if (Number.isFinite(o.snrDb)) {
    const rng = mulberry32(seed)
    // White noise whose power inside 2500 Hz is the sine's power (A²/2) divided by the SNR.
    const sigma = AMPLITUDE * Math.sqrt((0.5 / 10 ** (o.snrDb / 10)) * (sr / 2 / 2500))
    for (let n = 0; n < audio.length; n++) {
      audio[n] += sigma * Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng())
    }
  }
  const charEnds: Synth['charEnds'] = []
  events.forEach((e, k) => {
    if (!e.down && (k === events.length - 1 || events[k + 1].i !== e.i)) charEnds.push({ char: tokens[e.i], t: lead + e.t })
  })
  return { audio, charEnds, end: lead + last }
}
