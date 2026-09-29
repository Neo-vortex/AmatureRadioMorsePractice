import type { KeyEvent } from '../morse/encoder'

const CHIRP_TIME_CONSTANT = 0.01

/** Transmitter chirp: pitch jumps up at each key-down and settles back within ~30 ms. */
export function scheduleChirp(param: AudioParam, events: readonly KeyEvent[], base: number, pitchHz: number, chirpHz: number): void {
  if (chirpHz <= 0) return
  for (const e of events) {
    if (!e.down) continue
    param.setValueAtTime(pitchHz + chirpHz, base + e.t)
    param.setTargetAtTime(pitchHz, base + e.t, CHIRP_TIME_CONSTANT)
  }
}

/** Pitch drift expressed as oscillator detune. */
export function driftCents(pitchHz: number, driftHz: number): number {
  return 1200 * Math.log2((pitchHz + driftHz) / pitchHz)
}
