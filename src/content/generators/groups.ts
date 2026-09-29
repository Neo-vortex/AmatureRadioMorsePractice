import { MORSE } from '../../morse/table'
import { randInt, type Rng } from '../rng'

export interface GroupOptions {
  charset: string
  minLen: number
  maxLen: number
  count: number
}

export function generateGroups(rng: Rng, { charset, minLen, maxLen, count }: GroupOptions): string {
  const chars = [...charset]
  if (chars.length === 0 || chars.some((c) => !MORSE[c])) {
    throw new Error(`Invalid charset "${charset}": must be non-empty Morse characters`)
  }
  if (minLen < 1 || minLen > maxLen) throw new Error(`Invalid group length ${minLen}..${maxLen}`)
  if (count < 1) throw new Error(`Invalid group count ${count}`)

  const groups: string[] = []
  for (let g = 0; g < count; g++) {
    const len = randInt(rng, minLen, maxLen)
    let group = ''
    for (let k = 0; k < len; k++) group += chars[Math.floor(rng() * chars.length)]
    groups.push(group)
  }
  return groups.join(' ')
}
