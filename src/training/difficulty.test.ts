import { describe, expect, it } from 'vitest'
import { getLevel, LEVELS } from './difficulty'

describe('difficulty levels', () => {
  it('matches the spec table', () => {
    expect(LEVELS.map((l) => [l.level, l.name, l.charWpm, l.effWpm, l.conditions])).toEqual([
      [1, 'Novice', 18, 5, 'clean'],
      [2, 'Beginner', 20, 10, 'clean'],
      [3, 'Intermediate', 20, 15, 'light-noise'],
      [4, 'Advanced', 25, 25, 'moderate'],
      [5, 'Expert', 30, 30, 'poor'],
      [6, 'Contest', 35, 35, 'contest'],
    ])
  })

  it('never has effective speed above character speed', () => {
    for (const l of LEVELS) expect(l.effWpm).toBeLessThanOrEqual(l.charWpm)
  })

  it('getLevel looks up by number', () => {
    expect(getLevel(4).name).toBe('Advanced')
  })
})
