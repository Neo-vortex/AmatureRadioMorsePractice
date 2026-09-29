import type { ContentChoice, ContentType } from '../content/choices'
import { generateCallsign } from '../content/generators/callsigns'
import { generateGroups } from '../content/generators/groups'
import { generateContestExchange, generateNumberGroup } from '../content/generators/numbers'
import { generateQcodes } from '../content/generators/qcodes'
import { generateQsoScript } from '../content/generators/qso'
import { generateWords } from '../content/generators/words'
import type { ContentLibrary, SentenceLevel } from '../content/library'
import { mulberry32, pick, type Rng } from '../content/rng'
import { DIGITS, LETTERS } from '../morse/table'
import type { Settings } from '../store/settings'
import { getLevel, type Level } from './difficulty'

export interface ExerciseItem {
  text: string
  kind: ContentType
  seed: number
}

const CHARSET = LETTERS + DIGITS
const WORD_MAX_RANK: Record<Level, number> = { 1: 300, 2: 1000, 3: 5000, 4: 15000, 5: 30000, 6: 50000 }
const WORD_MAX_LEN: Record<Level, number> = { 1: 4, 2: 5, 3: 7, 4: 9, 5: 12, 6: 20 }
const SENTENCE_LEVEL: Record<Level, SentenceLevel> = { 1: 'easy', 2: 'easy', 3: 'medium', 4: 'medium', 5: 'hard', 6: 'hard' }

/** 'custom' speed settings get middle-of-the-road content. */
const levelNumber = (level: Settings['level']): Level => (level === 'custom' ? 3 : level)

export function resolveKind(level: Settings['level'], choice: ContentChoice, rng: Rng): ContentType {
  if (choice !== 'auto') return choice
  const content = getLevel(levelNumber(level)).content
  switch (content) {
    case 'chars':
      return 'groups'
    case 'short-words':
      return 'words'
    case 'words-callsigns':
      return rng() < 0.5 ? 'words' : 'callsigns'
    case 'sentences-qso':
      return rng() < 0.5 ? 'sentences' : 'qso'
    case 'callsigns-serials':
      return 'contest'
  }
}

async function textFor(kind: ContentType, n: Level, rng: Rng, lib: ContentLibrary): Promise<string> {
  switch (kind) {
    case 'groups':
      return generateGroups(rng, n === 1
        ? { charset: CHARSET, minLen: 1, maxLen: 3, count: 3 }
        : { charset: CHARSET, minLen: 5, maxLen: 5, count: 5 })
    case 'words':
      return generateWords(rng, await lib.words(), { count: 5, maxRank: WORD_MAX_RANK[n], minLen: 1, maxLen: WORD_MAX_LEN[n] })
    case 'sentences': {
      const level = SENTENCE_LEVEL[n]
      const chunks = (await lib.manifest()).sentences[level].chunks.length
      return pick(rng, await lib.sentences(level, Math.floor(rng() * chunks)))
    }
    case 'callsigns':
      return Array.from({ length: 4 }, () => generateCallsign(rng)).join(' ')
    case 'numbers':
      return generateNumberGroup(rng, 5)
    case 'qcodes':
      return generateQcodes(rng, 5)
    case 'qso':
      return pick(rng, generateQsoScript(rng))
    case 'contest':
      return Array.from({ length: 2 }, () => generateContestExchange(rng)).join(' ')
  }
}

export async function makeItem(s: Pick<Settings, 'level' | 'content'>, seed: number, lib: ContentLibrary): Promise<ExerciseItem> {
  const rng = mulberry32(seed)
  const kind = resolveKind(s.level, s.content, rng)
  return { text: await textFor(kind, levelNumber(s.level), rng, lib), kind, seed }
}
