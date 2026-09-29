import type { Rng } from '../content/rng'
import type { KeyEvent } from '../morse/encoder'

export const dbToGain = (db: number): number => 10 ** (db / 20)

export function rms(x: ArrayLike<number>, from = 0, to = x.length): number {
  let sum = 0
  for (let k = from; k < to; k++) sum += x[k] * x[k]
  return Math.sqrt(sum / Math.max(1, to - from))
}

function normalize(x: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  const r = rms(x)
  if (r > 0) for (let k = 0; k < x.length; k++) x[k] /= r
  return x
}

export function whiteNoise(rng: Rng, n: number): Float32Array<ArrayBuffer> {
  const x = new Float32Array(n)
  for (let k = 0; k < n; k++) x[k] = rng() * 2 - 1
  return normalize(x)
}

/** Paul Kellet's refined pink-noise filter over white noise. */
export function pinkNoise(rng: Rng, n: number): Float32Array<ArrayBuffer> {
  const x = new Float32Array(n)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let k = 0; k < n; k++) {
    const w = rng() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    x[k] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
    b6 = w * 0.115926
  }
  return normalize(x)
}

/** A static crash: ~150 ms of noise with a fast attack and exponential decay. */
export function crashBuffer(rng: Rng, sampleRate: number): Float32Array<ArrayBuffer> {
  const n = Math.round(sampleRate * 0.15)
  const x = new Float32Array(n)
  for (let k = 0; k < n; k++) x[k] = (rng() * 2 - 1) * Math.exp(-k / (sampleRate * 0.03))
  return x
}

/** Slow fading: two incommensurate sines → gain between -depthDb and 0 dB. */
export function qsbCurve(rng: Rng, seconds: number, depthDb: number, rateHz: number, pointsPerSecond = 20): Float32Array<ArrayBuffer> {
  const n = Math.max(2, Math.ceil(seconds * pointsPerSecond))
  const p1 = rng() * 2 * Math.PI
  const p2 = rng() * 2 * Math.PI
  const out = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    const t = k / pointsPerSecond
    const s = 0.6 * Math.sin(2 * Math.PI * rateHz * t + p1) + 0.4 * Math.sin(2 * Math.PI * rateHz * 1.73 * t + p2)
    out[k] = dbToGain((-depthDb * (1 - s)) / 2)
  }
  return out
}

/** Event times of a Poisson process (e.g. static crashes). */
export function poissonTimes(rng: Rng, seconds: number, perMinute: number): number[] {
  if (perMinute <= 0) return []
  const rate = perMinute / 60
  const times: number[] = []
  let t = -Math.log(1 - rng()) / rate
  while (t < seconds) {
    times.push(t)
    t += -Math.log(1 - rng()) / rate
  }
  return times
}

/** Human sending: random per-element timing error plus a gradual speed drift. */
export function applyFist(events: readonly KeyEvent[], fist: { jitter: number; speedDrift: number }, rng: Rng): KeyEvent[] {
  if (events.length === 0 || (fist.jitter === 0 && fist.speedDrift === 0)) return events.map((e) => ({ ...e }))
  const direction = rng() < 0.5 ? -1 : 1
  const out: KeyEvent[] = [{ ...events[0] }]
  for (let k = 1; k < events.length; k++) {
    const d = events[k].t - events[k - 1].t
    const progress = k / (events.length - 1)
    const drift = 1 + direction * fist.speedDrift * progress
    const jitter = 1 + fist.jitter * (rng() * 2 - 1)
    out.push({ ...events[k], t: out[k - 1].t + Math.max(0.2 * d, d * jitter * drift) })
  }
  return out
}
