import { pick, randInt, type Rng } from '../rng'

// Real ITU prefixes grouped by typical suffix length; the digit after the prefix is the call area.
const RULES: readonly { prefixes: readonly string[]; suffix: readonly [number, number] }[] = [
  { prefixes: ['K', 'W', 'N'], suffix: [1, 3] },
  {
    prefixes: ['AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AI', 'AJ', 'AK', 'KA', 'KB', 'KC', 'KD', 'KE', 'KF', 'KG',
      'KI', 'KJ', 'KK', 'KN', 'KO', 'WA', 'WB', 'WD', 'KH', 'KP', 'KL'],
    suffix: [1, 3],
  },
  { prefixes: ['VE', 'VA', 'G', 'M', '2E', 'GM', 'GW', 'GI', 'EI'], suffix: [2, 3] },
  {
    prefixes: ['F', 'DL', 'DK', 'DJ', 'DO', 'I', 'IK', 'IZ', 'EA', 'ON', 'PA', 'PD', 'OH', 'SM', 'LA', 'OZ', 'OK', 'OM',
      'SP', 'SQ', 'HA', 'YO', 'LZ', 'S5', '9A', 'YU', 'OE', 'HB', 'CT', 'UA', 'UR', 'EP', 'EK', '4X', 'A6'],
    suffix: [2, 3],
  },
  { prefixes: ['JA', 'JH', 'JR', 'BY', 'BG', 'HL', 'DU', 'YB', 'VU', 'VK', 'ZL', 'ZS', 'PY', 'LU', 'CE', 'XE'], suffix: [2, 3] },
]

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const CALLSIGN_PATTERN = /^[A-Z0-9]{1,3}[0-9][A-Z]{1,3}(\/[PM])?$/

export function generateCallsign(rng: Rng, allowPortable = true): string {
  const rule = pick(rng, RULES)
  const len = randInt(rng, rule.suffix[0], rule.suffix[1])
  let suffix = ''
  for (let k = 0; k < len; k++) suffix += LETTERS[Math.floor(rng() * LETTERS.length)]
  const call = `${pick(rng, rule.prefixes)}${randInt(rng, 0, 9)}${suffix}`
  if (!allowPortable) return call
  const r = rng()
  return r < 0.06 ? `${call}/P` : r < 0.09 ? `${call}/M` : call
}
