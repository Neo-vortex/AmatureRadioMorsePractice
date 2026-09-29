import { mulberry32, shuffle } from '../../src/content/rng.ts'

export const SENTENCE_LEVELS = ['easy', 'medium', 'hard'] as const
export type SentenceLevel = (typeof SENTENCE_LEVELS)[number]

const MORSE_TEXT = /^[A-Z0-9 .,?/=+-]+$/
// Pieces of split contractions in subtitle word lists ("don't" → "don" + "'t").
const FRAGMENTS = new Set([
  'don', 'isn', 've', 'll', 're', 'didn', 'doesn', 'wasn', 'couldn', 'wouldn', 'shouldn',
  'aren', 'haven', 'hasn', 'weren', 'ain', 'hadn', 'mustn', 'needn', 'em',
])

/** Blocklisted word, or a simple plural of one ("asses", "damns"). */
export function isBlocked(word: string, blocklist: ReadonlySet<string>): boolean {
  const w = word.toLowerCase()
  return blocklist.has(w) || (w.endsWith('s') && blocklist.has(w.slice(0, -1))) || (w.endsWith('es') && blocklist.has(w.slice(0, -2)))
}

export function normalizeSentence(raw: string): string | null {
  const s = raw
    .replace(/[‘’']/g, '')
    .replace(/!/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
  if (s.length < 8 || s.length > 80 || !MORSE_TEXT.test(s)) return null
  return s
}

export function sentenceWords(s: string): string[] {
  return s.split(/[^A-Z]+/).filter(Boolean)
}

export function cleanWordList(lines: readonly string[], blocklist: ReadonlySet<string>): string[] {
  const seen = new Set<string>()
  const words: string[] = []
  for (const line of lines) {
    const w = line.trim().split(/\s+/)[0] ?? ''
    if (!/^[a-z]+$/.test(w)) continue
    if (w.length === 1 && w !== 'a' && w !== 'i') continue
    if (FRAGMENTS.has(w) || isBlocked(w, blocklist) || seen.has(w)) continue
    seen.add(w)
    words.push(w)
  }
  return words
}

export function sentenceLevel(s: string, words: readonly string[], rank: ReadonlyMap<string, number>): SentenceLevel | null {
  let rarest = 0
  for (const w of words) {
    const r = rank.get(w)
    if (r === undefined) return null
    rarest = Math.max(rarest, r)
  }
  if (s.length <= 30 && rarest < 2000) return 'easy'
  if (s.length <= 50 && rarest < 10000) return 'medium'
  return 'hard'
}

export function selectSentences(
  sentences: readonly string[],
  rank: ReadonlyMap<string, number>,
  blocklist: ReadonlySet<string>,
  perLevel: number,
  seed: number,
): Record<SentenceLevel, string[]> {
  const out: Record<SentenceLevel, string[]> = { easy: [], medium: [], hard: [] }
  const seen = new Set<string>()
  for (const s of sentences) {
    if (seen.has(s)) continue
    seen.add(s)
    const words = sentenceWords(s)
    if (words.length === 0 || words.some((w) => isBlocked(w, blocklist))) continue
    const level = sentenceLevel(s, words, rank)
    if (level) out[level].push(s)
  }
  const rng = mulberry32(seed)
  for (const level of SENTENCE_LEVELS) out[level] = shuffle(out[level], rng).slice(0, perLevel)
  return out
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let k = 0; k < items.length; k += size) out.push(items.slice(k, k + size))
  return out
}
