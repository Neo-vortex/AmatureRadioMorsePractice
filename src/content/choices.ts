export type ContentType = 'groups' | 'words' | 'sentences' | 'callsigns' | 'numbers' | 'qcodes' | 'qso' | 'contest'
export type ContentChoice = 'auto' | ContentType

export const CONTENT_CHOICES: readonly { value: ContentChoice; label: string }[] = [
  { value: 'auto', label: 'Auto (by level)' },
  { value: 'groups', label: 'Letter groups' },
  { value: 'words', label: 'Words' },
  { value: 'sentences', label: 'Sentences' },
  { value: 'callsigns', label: 'Callsigns' },
  { value: 'numbers', label: 'Numbers & RST' },
  { value: 'qcodes', label: 'Q-codes & abbreviations' },
  { value: 'qso', label: 'QSO exchanges' },
  { value: 'contest', label: 'Contest exchanges' },
]

export function isContentChoice(x: unknown): x is ContentChoice {
  return CONTENT_CHOICES.some((c) => c.value === x)
}
