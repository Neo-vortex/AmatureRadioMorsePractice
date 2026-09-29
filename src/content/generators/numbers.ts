import { randInt, type Rng } from '../rng'
import { generateCallsign } from './callsigns'

export function generateRst(rng: Rng): string {
  return `${randInt(rng, 3, 5)}${randInt(rng, 3, 9)}9`
}

export function generateSerial(rng: Rng): string {
  return String(randInt(rng, 1, 999)).padStart(3, '0')
}

/** Contest "cut numbers": 0 is sent as T and 9 as N. */
export function cutNumbers(s: string): string {
  return s.replace(/0/g, 'T').replace(/9/g, 'N')
}

export function generateNumberGroup(rng: Rng, count: number): string {
  const makers = [() => generateRst(rng), () => generateSerial(rng), () => String(randInt(rng, 0, 9999))]
  return Array.from({ length: count }, () => makers[randInt(rng, 0, makers.length - 1)]()).join(' ')
}

export function generateContestExchange(rng: Rng): string {
  return `${generateCallsign(rng, false)} 5NN ${cutNumbers(generateSerial(rng))}`
}
