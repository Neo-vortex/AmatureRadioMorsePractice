import micTapUrl from './micTap.worklet.ts?worker&url'

export type FilterSetting = { mode: 'off' } | { mode: 'on'; hz: number; widthHz: number }

const FILTER_GLIDE = 0.05

/** Microphone → bandpass → audio-thread tap, plus an analyser on the raw input for the waterfall. */
export class Capture {
  readonly analyser: AnalyserNode
  private readonly ctx: AudioContext
  private readonly stream: MediaStream
  private readonly filter: BiquadFilterNode
  private readonly tap: AudioWorkletNode

  /** `ctx` must be created inside the click that starts listening (Safari's autoplay rules). */
  static async start(ctx: AudioContext, stream: MediaStream): Promise<Capture> {
    if (!ctx.audioWorklet) throw new Error("This browser can't decode live audio (no AudioWorklet support).")
    await ctx.audioWorklet.addModule(micTapUrl)
    return new Capture(ctx, stream)
  }

  private constructor(ctx: AudioContext, stream: MediaStream) {
    this.ctx = ctx
    this.stream = stream
    const source = ctx.createMediaStreamSource(stream)
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 4096
    this.analyser.smoothingTimeConstant = 0
    source.connect(this.analyser)
    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'allpass'
    this.tap = new AudioWorkletNode(ctx, 'mic-tap', { channelCount: 1, channelCountMode: 'explicit' })
    // The tap must reach the destination to be processed; a muted gain keeps it silent.
    const mute = ctx.createGain()
    mute.gain.value = 0
    source.connect(this.filter).connect(this.tap).connect(mute).connect(ctx.destination)
  }

  get sampleRate(): number {
    return this.ctx.sampleRate
  }

  /** From now on the tapped audio goes to `port`; the previous port is closed. */
  attach(port: MessagePort): void {
    this.tap.port.postMessage({ port }, [port])
  }

  setFilter(f: FilterSetting): void {
    if (f.mode === 'off') {
      this.filter.type = 'allpass'
      return
    }
    const t = this.ctx.currentTime
    this.filter.type = 'bandpass'
    this.filter.frequency.setTargetAtTime(f.hz, t, FILTER_GLIDE)
    this.filter.Q.setTargetAtTime(f.hz / f.widthHz, t, FILTER_GLIDE)
  }

  /** Called when the microphone goes away (unplugged, permission revoked). */
  onEnded(cb: () => void): void {
    for (const track of this.stream.getAudioTracks()) track.onended = cb
  }

  stop(): void {
    this.tap.port.postMessage({ port: null })
    for (const track of this.stream.getTracks()) {
      track.onended = null
      track.stop()
    }
    void this.ctx.close()
  }
}
