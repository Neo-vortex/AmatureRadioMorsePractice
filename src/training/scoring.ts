export type Op =
  | { kind: 'match'; char: string }
  | { kind: 'sub'; expected: string; typed: string }
  | { kind: 'missing'; expected: string }
  | { kind: 'extra'; typed: string }

export interface ScoreResult {
  ops: Op[]
  correct: number
  /** Expected characters plus extra typed characters. */
  total: number
  accuracy: number
}

export function normalizeAnswer(s: string): string {
  // Prosigns are shown as <KN>; typing KN counts the same.
  return s.toUpperCase().replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
}

/** Character-level Levenshtein alignment of what was sent against what was typed. */
export function score(expected: string, typed: string): ScoreResult {
  const a = normalizeAnswer(expected)
  const b = normalizeAnswer(typed)
  const n = a.length
  const m = b.length
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = 0; i <= n; i++) d[i][0] = i
  for (let j = 0; j <= m; j++) d[0][j] = j
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j - 1] + cost, d[i - 1][j] + 1, d[i][j - 1] + 1)
    }
  }

  const ops: Op[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      ops.push(a[i - 1] === b[j - 1] ? { kind: 'match', char: a[i - 1] } : { kind: 'sub', expected: a[i - 1], typed: b[j - 1] })
      i--
      j--
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.push({ kind: 'missing', expected: a[i - 1] })
      i--
    } else {
      ops.push({ kind: 'extra', typed: b[j - 1] })
      j--
    }
  }
  ops.reverse()

  const correct = ops.filter((o) => o.kind === 'match').length
  const total = n + ops.filter((o) => o.kind === 'extra').length
  return { ops, correct, total, accuracy: total === 0 ? 1 : correct / total }
}
