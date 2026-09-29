/** Character error rate: edit distance divided by the expected length. */
export function charErrorRate(expected: string, actual: string): number {
  let prev = Array.from({ length: actual.length + 1 }, (_, j) => j)
  for (let i = 1; i <= expected.length; i++) {
    const row = [i]
    for (let j = 1; j <= actual.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (expected[i - 1] === actual[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[actual.length] / Math.max(1, expected.length)
}
