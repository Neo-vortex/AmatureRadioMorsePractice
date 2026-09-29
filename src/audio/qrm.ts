import { generateCallsign } from '../content/generators/callsigns'
import { generateContestExchange } from '../content/generators/numbers'
import { randInt, type Rng } from '../content/rng'
import type { Conditions } from './conditions'

export interface QrmStation {
  offsetHz: number
  wpm: number
  text: string
  gainDb: number
  startDelay: number
}

/** Other stations near our frequency, each sending its own traffic. */
export function planQrm(rng: Rng, qrm: Conditions['qrm'], seconds: number): QrmStation[] {
  return Array.from({ length: qrm.stations }, () => {
    const call = generateCallsign(rng, false)
    return {
      offsetHz: (50 + rng() * (qrm.maxOffsetHz - 50)) * (rng() < 0.5 ? -1 : 1),
      wpm: randInt(rng, 15, 35),
      text: rng() < 0.5 ? `CQ CQ DE ${call} ${call} K` : `${generateContestExchange(rng)} ${generateContestExchange(rng)}`,
      gainDb: qrm.levelDb + (rng() * 6 - 3),
      startDelay: rng() * seconds * 0.5,
    }
  })
}
