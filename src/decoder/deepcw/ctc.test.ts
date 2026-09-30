import { describe, expect, it } from 'vitest'
import { greedyCtc } from './ctc'

const CHARS = ['A', 'B', ' ']
const BLANK = 3

/** One-hot log-probabilities for a sequence of class indexes. */
const probs = (classes: number[]) => {
  const out = new Float32Array(classes.length * 4).fill(-10)
  classes.forEach((c, t) => (out[t * 4 + c] = 0))
  return out
}

describe('greedyCtc', () => {
  it('merges repeats, splits on blank and keeps each character’s frames', () => {
    const spans = greedyCtc(probs([3, 0, 0, 3, 0, 2, 1, 1]), 8, 4, CHARS, BLANK)
    expect(spans.map((s) => s.char).join('')).toBe('AA B')
    expect(spans[0]).toEqual({ char: 'A', startFrame: 1, endFrame: 2 })
    expect(spans[3]).toEqual({ char: 'B', startFrame: 6, endFrame: 7 })
  })

  it('returns nothing for blanks only', () => {
    expect(greedyCtc(probs([3, 3, 3]), 3, 4, CHARS, BLANK)).toEqual([])
  })
})
