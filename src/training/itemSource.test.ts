import { describe, expect, it } from 'vitest'
import { makeItem } from './itemSource'

describe('makeItem', () => {
  it('is deterministic for a seed', () => {
    expect(makeItem(2, 123)).toEqual(makeItem(2, 123))
  })

  it('level 1 gives three short groups of 1–3 characters', () => {
    const groups = makeItem(1, 7).text.split(' ')
    expect(groups).toHaveLength(3)
    for (const g of groups) expect(g).toMatch(/^[A-Z0-9]{1,3}$/)
  })

  it('other levels and custom give five 5-character groups', () => {
    for (const level of [2, 6, 'custom'] as const) {
      const item = makeItem(level, 99)
      expect(item.kind).toBe('groups')
      expect(item.seed).toBe(99)
      expect(item.text).toMatch(/^([A-Z0-9]{5} ){4}[A-Z0-9]{5}$/)
    }
  })
})
