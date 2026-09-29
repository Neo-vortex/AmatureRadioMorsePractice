import { pick, type Rng } from '../rng'

export interface WordOptions {
  count: number
  /** Only the `maxRank` most frequent words are eligible. */
  maxRank: number
  minLen: number
  maxLen: number
}

export function generateWords(rng: Rng, words: readonly string[], { count, maxRank, minLen, maxLen }: WordOptions): string {
  const pool = words.slice(0, maxRank).filter((w) => w.length >= minLen && w.length <= maxLen)
  if (pool.length === 0) throw new Error(`no words for rank ≤ ${maxRank}, length ${minLen}..${maxLen}`)
  return Array.from({ length: count }, () => pick(rng, pool)).join(' ')
}
