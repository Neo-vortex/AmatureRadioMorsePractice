export type Level = 1 | 2 | 3 | 4 | 5 | 6

export type ContentKind = 'chars' | 'short-words' | 'words-callsigns' | 'sentences-qso' | 'callsigns-serials'

/** Band-condition preset names; the impairment parameters behind them arrive in Plan 2. */
export type ConditionsPreset = 'clean' | 'light-noise' | 'moderate' | 'poor' | 'contest'

export interface DifficultyProfile {
  level: Level
  name: string
  charWpm: number
  effWpm: number
  content: ContentKind
  conditions: ConditionsPreset
}

export const LEVELS: readonly DifficultyProfile[] = [
  { level: 1, name: 'Novice', charWpm: 18, effWpm: 5, content: 'chars', conditions: 'clean' },
  { level: 2, name: 'Beginner', charWpm: 20, effWpm: 10, content: 'short-words', conditions: 'clean' },
  { level: 3, name: 'Intermediate', charWpm: 20, effWpm: 15, content: 'words-callsigns', conditions: 'light-noise' },
  { level: 4, name: 'Advanced', charWpm: 25, effWpm: 25, content: 'sentences-qso', conditions: 'moderate' },
  { level: 5, name: 'Expert', charWpm: 30, effWpm: 30, content: 'sentences-qso', conditions: 'poor' },
  { level: 6, name: 'Contest', charWpm: 35, effWpm: 35, content: 'callsigns-serials', conditions: 'contest' },
]

export function getLevel(level: Level): DifficultyProfile {
  return LEVELS[level - 1]
}
