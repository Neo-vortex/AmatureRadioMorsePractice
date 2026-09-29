import { mulberry32, type Rng } from '../content/rng'

export interface ImpairmentStreams {
  noise: Rng
  crash: Rng
  qrn: Rng
  qrm: Rng
  qsb: Rng
  fist: Rng
}

// One independent stream per impairment: buffers whose size depends on the sample rate
// (noise, crash) can't shift the planned events, so live playback and WAV export match.
const SALTS: Record<keyof ImpairmentStreams, number> = {
  noise: 0x5bd1e995,
  crash: 0x27d4eb2f,
  qrn: 0x165667b1,
  qrm: 0x9e3779b1,
  qsb: 0x85ebca77,
  fist: 0xc2b2ae3d,
}

export function impairmentStreams(seed: number): ImpairmentStreams {
  const make = (salt: number) => mulberry32((seed ^ salt) >>> 0)
  return {
    noise: make(SALTS.noise),
    crash: make(SALTS.crash),
    qrn: make(SALTS.qrn),
    qrm: make(SALTS.qrm),
    qsb: make(SALTS.qsb),
    fist: make(SALTS.fist),
  }
}
