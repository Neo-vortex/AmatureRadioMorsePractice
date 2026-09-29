import { encodeTokens, type KeyEvent } from '../morse/encoder'
import { tokenize } from '../morse/table'
import type { Timing } from '../morse/timing'
import { scheduleEnvelope } from './envelope'
import { fadeOutAndStop } from './fade'
import { planReschedule } from './reschedule'

export interface PlayOptions {
  text: string
  timing: Timing
  pitchHz: number
  volume: number
  /** Called once when playback ends, whether it finished or was stopped. */
  onEnd?: () => void
}

export interface PlaybackHandle {
  stop(): void
  /** Re-times everything not yet started; the character in progress finishes unchanged. */
  setTiming(timing: Timing): void
  isPlaying(): boolean
}

const START_DELAY = 0.1
const RESCHEDULE_MARGIN = 0.05
const TAIL = 0.05

export class MorseEngine {
  private ctx: AudioContext | null = null
  private current: PlaybackHandle | null = null

  play(opts: PlayOptions): PlaybackHandle {
    this.current?.stop()
    this.current = startPlayback(this.context(), opts)
    return this.current
  }

  stop(): void {
    this.current?.stop()
    this.current = null
  }

  private context(): AudioContext {
    this.ctx ??= new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }
}

export const engine = new MorseEngine()

function startPlayback(ctx: AudioContext, opts: PlayOptions): PlaybackHandle {
  const tokens = tokenize(opts.text)
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = opts.pitchHz
  const envelope = ctx.createGain()
  envelope.gain.value = 0
  const master = ctx.createGain()
  master.gain.value = opts.volume
  osc.connect(envelope)
  envelope.connect(master)
  master.connect(ctx.destination)

  const start = ctx.currentTime + START_DELAY
  const encoded = encodeTokens(tokens, opts.timing)
  // Absolute (AudioContext-time) copy of the schedule, needed to find where a speed change can start.
  let scheduled: KeyEvent[] = encoded.events.map((e) => ({ ...e, t: e.t + start }))
  let playing = true
  let stopping = false

  scheduleEnvelope(envelope.gain, encoded.events, start)
  osc.onended = () => {
    playing = false
    osc.disconnect()
    envelope.disconnect()
    master.disconnect()
    opts.onEnd?.()
  }
  osc.start(start)
  osc.stop(start + encoded.duration + TAIL)

  return {
    isPlaying: () => playing,
    stop() {
      if (!playing || stopping) return
      stopping = true
      fadeOutAndStop(master.gain, osc, ctx.currentTime)
    },
    setTiming(timing) {
      // A re-time would push osc.stop() past the fade-out, so ignore it once stopping.
      if (!playing || stopping) return
      const plan = planReschedule(scheduled, tokens, timing, ctx.currentTime + RESCHEDULE_MARGIN)
      if (!plan) return
      const { keep, fromToken, at } = plan
      const rest = encodeTokens(tokens.slice(fromToken), timing)
      // Cancel from whichever is earlier: the old next key-down or the new one.
      envelope.gain.cancelScheduledValues(Math.min(at, scheduled[keep].t))
      scheduleEnvelope(envelope.gain, rest.events, at)
      scheduled = [
        ...scheduled.slice(0, keep),
        ...rest.events.map((e) => ({ ...e, i: e.i + fromToken, t: e.t + at })),
      ]
      osc.stop(at + rest.duration + TAIL)
    },
  }
}
