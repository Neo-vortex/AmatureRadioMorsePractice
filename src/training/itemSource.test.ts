import { describe, expect, it } from 'vitest'
import type { ContentType } from '../content/choices'
import { createLibrary } from '../content/library'
import { isLosslessMorse } from '../content/testing'
import { makeItem } from './itemSource'

const files: Record<string, unknown> = {
  'manifest.json': {
    version: 1,
    words: { file: 'words.json', count: 6 },
    sentences: {
      easy: { count: 1, chunks: ['e.json'] },
      medium: { count: 1, chunks: ['m.json'] },
      hard: { count: 1, chunks: ['h.json'] },
    },
    sources: [],
  },
  'words.json': ['A', 'I', 'THE', 'CAT', 'HOUSE', 'BEAUTIFUL'],
  'e.json': ['EASY ONE.'],
  'm.json': ['MEDIUM ONE.'],
  'h.json': ['HARD ONE.'],
}
const lib = createLibrary(async (p) => files[p])

describe('makeItem', () => {
  it('is deterministic for a seed', async () => {
    const s = { level: 3, content: 'auto' } as const
    expect(await makeItem(s, 42, lib)).toEqual(await makeItem(s, 42, lib))
  })

  it('auto at level 1 gives three short letter groups', async () => {
    const item = await makeItem({ level: 1, content: 'auto' }, 7, lib)
    expect(item.kind).toBe('groups')
    expect(item.text).toMatch(/^[A-Z0-9]{1,3} [A-Z0-9]{1,3} [A-Z0-9]{1,3}$/)
  })

  it('auto at level 2 gives five short common words', async () => {
    const item = await makeItem({ level: 2, content: 'auto' }, 7, lib)
    expect(item.kind).toBe('words')
    for (const w of item.text.split(' ')) expect(['A', 'I', 'THE', 'CAT', 'HOUSE']).toContain(w)
    expect(item.text.split(' ')).toHaveLength(5)
  })

  it('sentences scale with the level', async () => {
    expect((await makeItem({ level: 1, content: 'sentences' }, 1, lib)).text).toBe('EASY ONE.')
    expect((await makeItem({ level: 4, content: 'sentences' }, 1, lib)).text).toBe('MEDIUM ONE.')
    expect((await makeItem({ level: 6, content: 'sentences' }, 1, lib)).text).toBe('HARD ONE.')
  })

  it('custom level letter groups are five groups of five', async () => {
    expect((await makeItem({ level: 'custom', content: 'groups' }, 3, lib)).text).toMatch(/^([A-Z0-9]{5} ){4}[A-Z0-9]{5}$/)
  })

  it('every content type yields sendable text of that kind', async () => {
    const kinds: ContentType[] = ['groups', 'words', 'sentences', 'callsigns', 'numbers', 'qcodes', 'qso', 'contest']
    for (const kind of kinds) {
      for (let seed = 0; seed < 30; seed++) {
        const item = await makeItem({ level: 4, content: kind }, seed, lib)
        expect(item.kind).toBe(kind)
        expect(isLosslessMorse(item.text), `${kind}: ${item.text}`).toBe(true)
      }
    }
  })

  it('auto levels map to the spec content', async () => {
    const kindsAt = async (level: 3 | 4 | 6) =>
      new Set(await Promise.all(Array.from({ length: 40 }, async (_, k) => (await makeItem({ level, content: 'auto' }, k, lib)).kind)))
    expect(await kindsAt(3)).toEqual(new Set(['words', 'callsigns']))
    expect(await kindsAt(4)).toEqual(new Set(['sentences', 'qso']))
    expect(await kindsAt(6)).toEqual(new Set(['contest']))
  })
})
