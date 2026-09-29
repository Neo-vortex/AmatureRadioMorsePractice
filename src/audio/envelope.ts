import type { KeyEvent } from '../morse/encoder'

export const RAMP_SECONDS = 0.005
const CURVE_SAMPLES = 64

export function raisedCosine(samples: number, rising: boolean): Float32Array {
  const curve = new Float32Array(samples)
  for (let n = 0; n < samples; n++) {
    const v = 0.5 - 0.5 * Math.cos((Math.PI * n) / (samples - 1))
    curve[n] = rising ? v : 1 - v
  }
  return curve
}

const RISE = raisedCosine(CURVE_SAMPLES, true)
const FALL = raisedCosine(CURVE_SAMPLES, false)

/** Shapes each key-down/up with a short raised-cosine ramp so elements don't click. */
export function scheduleEnvelope(param: AudioParam, events: readonly KeyEvent[], base: number, ramp = RAMP_SECONDS): void {
  for (const e of events) param.setValueCurveAtTime(e.down ? RISE : FALL, base + e.t, ramp)
}
