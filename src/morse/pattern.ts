import { DIGITS, LETTERS, MORSE, PROSIGNS, PUNCTUATION, tokenize } from './table'

export const MORSE_CHART: { token: string; pattern: string }[] = [...LETTERS, ...DIGITS, ...PUNCTUATION, ...PROSIGNS].map(
  (token) => ({ token, pattern: MORSE[token] }),
)

const REVERSE = new Map<string, string>()
for (const { token, pattern } of [...MORSE_CHART].reverse()) REVERSE.set(pattern, token)

export function normalizeMorseInput(input: string): string {
  return input.replace(/[·•∙]/g, '.').replace(/[_—–−]/g, '-')
}

export function parseMorseInput(input: string): string[] {
  const words = normalizeMorseInput(input)
    .trim()
    .split(/\s*[/|]\s*|\s{2,}/)
    .map((w) => w.split(/\s+/).filter(Boolean))
    .filter((w) => w.length > 0)
  return words.flatMap((w, k) => (k === 0 ? w : [' ', ...w]))
}

export function expectedPatterns(text: string): string[] {
  return tokenize(text).map((t) => (t === ' ' ? ' ' : MORSE[t]))
}

export function patternToText(pattern: string): string {
  return REVERSE.get(pattern) ?? '■'
}

export function toPattern(text: string): { token: string; pattern: string }[][] {
  const words: { token: string; pattern: string }[][] = [[]]
  for (const token of tokenize(text)) {
    if (token === ' ') words.push([])
    else words[words.length - 1].push({ token, pattern: MORSE[token] })
  }
  return words.filter((w) => w.length > 0)
}

export function unsupportedChars(text: string): string[] {
  const cleaned = text.toUpperCase().replace(/<(AR|SK|BT|KN)>/g, '')
  return [...new Set([...cleaned].filter((c) => !/\s/.test(c) && !MORSE[c]))]
}
