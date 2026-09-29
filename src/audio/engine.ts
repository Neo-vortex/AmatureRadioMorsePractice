import { tokenize } from '../morse/table'
import type { Timing } from '../morse/timing'
import type { Conditions } from './conditions'
import { fadeOutAndStop } from './fade'
import { buildGraph, type Graph, type GraphOptions } from './graph'

export interface PlayOptions extends GraphOptions {
  /** Called once when playback ends, whether it finished or was stopped. */
  onEnd?: () => void
}

export interface PlaybackHandle {
  stop(): void
  /** Re-times everything not yet started; the character in progress finishes unchanged. */
  setTiming(timing: Timing): void
  /** Switches band conditions after the character in progress, for the rest of the item. */
  setConditions(conditions: Conditions): void
  isPlaying(): boolean
  /** Token (from tokenize(text) or the given tokens) being keyed right now, or null. */
  currentToken(): number | null
}

const START_DELAY = 0.1
const RESCHEDULE_MARGIN = 0.05

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

  /**
   * Creates/resumes the AudioContext. Call synchronously from a click or key handler:
   * Safari only allows starting audio inside the user gesture, not after an await.
   */
  unlock(): void {
    this.context()
  }

  private context(): AudioContext {
    this.ctx ??= new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }
}

export const engine = new MorseEngine()

/** A graph playing part of the item, from token `offset` of the whole item on. */
interface Segment {
  graph: Graph
  offset: number
}

function startPlayback(ctx: AudioContext, opts: PlayOptions): PlaybackHandle {
  const tokens = opts.tokens ?? tokenize(opts.text)
  let timing = opts.timing
  let conditions = opts.conditions
  let current: Segment = { graph: buildGraph(ctx, ctx.destination, opts, ctx.currentTime + START_DELAY), offset: 0 }
  // Still finishing its last character after a handoff to `current`.
  let previous: Segment | null = null
  let playing = true
  let stopping = false
  const watch = (graph: Graph) =>
    graph.onEnded(() => {
      graph.dispose()
      if (previous?.graph === graph) previous = null
      // A graph that handed off doesn't end the playback.
      if (graph !== current.graph) return
      playing = false
      opts.onEnd?.()
    })
  const tokenIn = (seg: Segment | null, time: number) => {
    const i = seg?.graph.tokenAt(time) ?? null
    return i === null ? null : i + seg!.offset
  }
  watch(current.graph)

  return {
    isPlaying: () => playing,
    currentToken: () => (playing ? (tokenIn(current, ctx.currentTime) ?? tokenIn(previous, ctx.currentTime)) : null),
    stop() {
      if (!playing || stopping) return
      stopping = true
      for (const seg of [current, previous]) if (seg) fadeOutAndStop(seg.graph.master.gain, seg.graph, ctx.currentTime)
    },
    setTiming(next: Timing) {
      // A re-time would push stop() past the fade-out, so ignore it once stopping.
      if (!playing || stopping) return
      timing = next
      current.graph.retime(timing, ctx.currentTime + RESCHEDULE_MARGIN)
    },
    setConditions(next: Conditions) {
      if (!playing || stopping || next === conditions) return
      conditions = next
      const plan = current.graph.handOff(timing, ctx.currentTime + RESCHEDULE_MARGIN)
      // The last character is already keying: nothing left to change.
      if (!plan) return
      const offset = current.offset + plan.fromToken
      const graph = buildGraph(ctx, ctx.destination, { ...opts, timing, conditions, tokens: tokens.slice(offset) }, plan.at, plan.switchAt)
      previous = current
      current = { graph, offset }
      watch(graph)
    },
  }
}
