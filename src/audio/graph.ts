import { mulberry32 } from '../content/rng'
import { encode, encodeTokens, type KeyEvent } from '../morse/encoder'
import { tokenize } from '../morse/table'
import { makeTiming, type Timing } from '../morse/timing'
import { driftCents, scheduleChirp } from './chirp'
import type { Conditions } from './conditions'
import { applyFist, crashBuffer, dbToGain, pinkNoise, poissonTimes, qsbCurve, whiteNoise } from './dsp'
import { scheduleEnvelope } from './envelope'
import { planQrm } from './qrm'
import { tokenAt as findToken } from './progress'
import { planReschedule } from './reschedule'

export interface GraphOptions {
  text: string
  timing: Timing
  pitchHz: number
  volume: number
  conditions: Conditions
  /** Seeds every random impairment, so a repeat sounds identical. */
  seed: number
  /** Pre-tokenized input; overrides `text` (e.g. '#.-' raw patterns of what the user wrote). */
  tokens?: string[]
}

export interface Graph {
  master: GainNode
  stop(when: number): void
  retime(timing: Timing, cutoff: number): void
  onEnded(cb: () => void): void
  dispose(): void
  /** Token index being keyed at AudioContext time `time`, or null in a gap. */
  tokenAt(time: number): number | null
}

const TAIL = 0.05
/** RMS of a full-scale sine: the reference for SNR. */
const SIGNAL_RMS = Math.SQRT1_2
/** Headroom so signal + noise + QRM + QRN rarely clip. */
const MIX_GAIN = 0.5

export function buildGraph(ctx: BaseAudioContext, destination: AudioNode, o: GraphOptions, start: number): Graph {
  const rng = mulberry32((o.seed ^ 0x5bd1e995) >>> 0)
  const c = o.conditions
  const tokens = o.tokens ?? tokenize(o.text)
  const nodes: AudioNode[] = []
  const sources: AudioScheduledSourceNode[] = []
  const track = <T extends AudioNode>(n: T): T => {
    nodes.push(n)
    return n
  }

  const master = track(ctx.createGain())
  master.gain.value = o.volume
  master.connect(destination)
  const mix = track(ctx.createGain())
  mix.gain.value = MIX_GAIN
  if (c.bandwidthHz > 0) {
    const bp = track(ctx.createBiquadFilter())
    bp.type = 'bandpass'
    bp.frequency.value = o.pitchHz
    bp.Q.value = o.pitchHz / c.bandwidthHz
    mix.connect(bp).connect(master)
  } else {
    mix.connect(master)
  }

  // Wanted signal: oscillator → keying envelope → QSB fading → mix.
  const osc = track(ctx.createOscillator())
  osc.frequency.value = o.pitchHz
  const envelope = track(ctx.createGain())
  envelope.gain.value = 0
  const fading = track(ctx.createGain())
  osc.connect(envelope).connect(fading).connect(mix)

  const events = applyFist(encodeTokens(tokens, o.timing).events, c.fist, rng)
  let duration = events.at(-1)?.t ?? 0
  let scheduled: KeyEvent[] = events.map((e) => ({ ...e, t: e.t + start }))
  scheduleEnvelope(envelope.gain, events, start)
  scheduleChirp(osc.frequency, events, start, o.pitchHz, c.fist.chirpHz)

  // Background impairments cover twice the item length, so slowing down mid-item stays covered.
  const cover = duration * 2 + 10
  const backgroundStart = Math.max(ctx.currentTime, start - 0.25)
  if (c.fist.driftHz > 0) {
    osc.detune.setValueAtTime(0, start)
    osc.detune.linearRampToValueAtTime(driftCents(o.pitchHz, c.fist.driftHz), start + cover)
  }
  if (c.qsb.depthDb > 0) fading.gain.setValueCurveAtTime(qsbCurve(rng, cover, c.qsb.depthDb, c.qsb.rateHz), start, cover)

  if (c.noise.type !== 'off') {
    const n = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate)
    buffer.copyToChannel(c.noise.type === 'white' ? whiteNoise(rng, n) : pinkNoise(rng, n), 0)
    const src = track(ctx.createBufferSource())
    src.buffer = buffer
    src.loop = true
    const gain = track(ctx.createGain())
    gain.gain.value = SIGNAL_RMS * dbToGain(-c.noise.snrDb)
    src.connect(gain).connect(mix)
    src.start(backgroundStart)
    sources.push(src)
  }

  if (c.qrn.perMinute > 0) {
    const crash = crashBuffer(rng, ctx.sampleRate)
    const buffer = ctx.createBuffer(1, crash.length, ctx.sampleRate)
    buffer.copyToChannel(crash, 0)
    const gain = track(ctx.createGain())
    gain.gain.value = dbToGain(c.qrn.levelDb)
    gain.connect(mix)
    for (const t of poissonTimes(rng, cover, c.qrn.perMinute)) {
      const src = track(ctx.createBufferSource())
      src.buffer = buffer
      src.connect(gain)
      src.start(backgroundStart + t)
      sources.push(src)
    }
  }

  for (const station of planQrm(rng, c.qrm, duration)) {
    const qosc = track(ctx.createOscillator())
    qosc.frequency.value = o.pitchHz + station.offsetHz
    const qenv = track(ctx.createGain())
    qenv.gain.value = 0
    const qgain = track(ctx.createGain())
    qgain.gain.value = dbToGain(station.gainDb)
    qosc.connect(qenv).connect(qgain).connect(mix)
    const qt = makeTiming({ charWpm: station.wpm, effWpm: station.wpm, extraWordGap: 0 })
    scheduleEnvelope(qenv.gain, encode(station.text, qt).events, start + station.startDelay)
    qosc.start(start)
    sources.push(qosc)
  }

  osc.start(start)
  sources.push(osc)
  const stop = (when: number) => sources.forEach((s) => s.stop(when))
  stop(start + duration + TAIL)

  return {
    master,
    stop,
    onEnded(cb) {
      osc.onended = cb
    },
    dispose() {
      nodes.forEach((n) => n.disconnect())
    },
    tokenAt: (time) => findToken(scheduled, time),
    retime(timing, cutoff) {
      const plan = planReschedule(scheduled, tokens, timing, cutoff)
      if (!plan) return
      const { keep, fromToken, at } = plan
      const rest = applyFist(encodeTokens(tokens.slice(fromToken), timing).events, c.fist, rng)
      const from = Math.min(at, scheduled[keep].t)
      envelope.gain.cancelScheduledValues(from)
      scheduleEnvelope(envelope.gain, rest, at)
      if (c.fist.chirpHz > 0) {
        osc.frequency.cancelScheduledValues(from)
        osc.frequency.setValueAtTime(o.pitchHz, from)
        scheduleChirp(osc.frequency, rest, at, o.pitchHz, c.fist.chirpHz)
      }
      scheduled = [...scheduled.slice(0, keep), ...rest.map((e) => ({ ...e, i: e.i + fromToken, t: e.t + at }))]
      duration = (rest.at(-1)?.t ?? 0) + at - start
      stop(start + duration + TAIL)
    },
  }
}
