export const FADE_SECONDS = 0.01

/** Stops a tone without a click: exponential fade of `gain` to silence, then stop the source. */
export function fadeOutAndStop(gain: AudioParam, source: { stop(when?: number): void }, now: number): void {
  gain.cancelScheduledValues(now)
  gain.setTargetAtTime(0, now, FADE_SECONDS / 5)
  source.stop(now + FADE_SECONDS)
}
