import { generateGroups, type GroupOptions } from '../content/generators/groups'
import { mulberry32 } from '../content/rng'
import { DIGITS, LETTERS } from '../morse/table'
import type { Settings } from '../store/settings'
import { getLevel, type ContentKind } from './difficulty'

export interface ExerciseItem {
  text: string
  kind: 'groups'
  seed: number
}

const CHARSET = LETTERS + DIGITS

// Only character groups exist so far; the content plan replaces this mapping with
// word, callsign, sentence and QSO generators per ContentKind.
export function groupOptionsFor(kind: ContentKind): GroupOptions {
  return kind === 'chars'
    ? { charset: CHARSET, minLen: 1, maxLen: 3, count: 3 }
    : { charset: CHARSET, minLen: 5, maxLen: 5, count: 5 }
}

export function makeItem(level: Settings['level'], seed: number): ExerciseItem {
  const kind: ContentKind = level === 'custom' ? 'words-callsigns' : getLevel(level).content
  return { text: generateGroups(mulberry32(seed), groupOptionsFor(kind)), kind: 'groups', seed }
}
