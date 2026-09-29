import type { Timing } from '../morse/timing'
import { fadeOutAndStop } from './fade'
import { buildGraph, type GraphOptions } from './graph'

export interface PlayOptions extends GraphOptions {
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

function startPlayback(ctx: AudioContext, opts: PlayOptions): PlaybackHandle {
  const graph = buildGraph(ctx, ctx.destination, opts, ctx.currentTime + START_DELAY)
  let playing = true
  let stopping = false
  graph.onEnded(() => {
    playing = false
    graph.dispose()
    opts.onEnd?.()
  })
  return {
    isPlaying: () => playing,
    stop() {
      if (!playing || stopping) return
      stopping = true
      fadeOutAndStop(graph.master.gain, graph, ctx.currentTime)
    },
    setTiming(timing: Timing) {
      // A re-time would push stop() past the fade-out, so ignore it once stopping.
      if (!playing || stopping) return
      graph.retime(timing, ctx.currentTime + RESCHEDULE_MARGIN)
    },
  }
}
