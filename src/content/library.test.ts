import { describe, expect, it, vi } from 'vitest'
import { createLibrary, parseManifest } from './library'

const manifest = {
  version: 1,
  words: { file: 'words.json', count: 3 },
  sentences: {
    easy: { count: 2, chunks: ['sentences/easy-0.json', 'sentences/easy-1.json'] },
    medium: { count: 1, chunks: ['sentences/medium-0.json'] },
    hard: { count: 1, chunks: ['sentences/hard-0.json'] },
  },
  sources: [],
}
const files: Record<string, unknown> = {
  'manifest.json': manifest,
  'words.json': ['THE', 'CAT', 'SAT'],
  'sentences/easy-0.json': ['EASY ZERO.'],
  'sentences/easy-1.json': ['EASY ONE.'],
  'sentences/medium-0.json': ['MEDIUM.'],
  'sentences/hard-0.json': ['HARD.'],
}

describe('content library', () => {
  it('loads and caches the manifest and word list', async () => {
    const fetchJson = vi.fn(async (p: string) => files[p])
    const lib = createLibrary(fetchJson)
    expect(await lib.words()).toEqual(['THE', 'CAT', 'SAT'])
    await lib.words()
    expect(fetchJson.mock.calls.map((c) => c[0])).toEqual(['manifest.json', 'words.json'])
  })

  it('loads a sentence chunk by index, wrapping out-of-range indexes', async () => {
    const lib = createLibrary(async (p) => files[p])
    expect(await lib.sentences('easy', 1)).toEqual(['EASY ONE.'])
    expect(await lib.sentences('easy', 2)).toEqual(['EASY ZERO.'])
  })

  it('retries after a failed fetch', async () => {
    let fail = true
    const lib = createLibrary(async (p) => {
      if (fail) throw new Error('offline')
      return files[p]
    })
    await expect(lib.manifest()).rejects.toThrow('offline')
    fail = false
    expect((await lib.manifest()).version).toBe(1)
  })

  it('rejects malformed data', async () => {
    await expect(createLibrary(async () => ({ version: 2 })).manifest()).rejects.toThrow(/manifest/)
    const lib = createLibrary(async (p) => (p === 'manifest.json' ? manifest : [1, 2]))
    await expect(lib.words()).rejects.toThrow(/word list/)
  })
})

describe('parseManifest', () => {
  it('requires at least one chunk per level', () => {
    const bad = { ...manifest, sentences: { ...manifest.sentences, hard: { count: 0, chunks: [] } } }
    expect(() => parseManifest(bad)).toThrow(/manifest/)
  })
})
