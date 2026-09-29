export const SENTENCE_LEVELS = ['easy', 'medium', 'hard'] as const
export type SentenceLevel = (typeof SENTENCE_LEVELS)[number]

export interface ContentManifest {
  version: 1
  words: { file: string; count: number }
  sentences: Record<SentenceLevel, { count: number; chunks: string[] }>
  sources: { name: string; url: string; license: string }[]
}

export interface ContentLibrary {
  manifest(): Promise<ContentManifest>
  words(): Promise<readonly string[]>
  sentences(level: SentenceLevel, chunk: number): Promise<readonly string[]>
}

export function parseManifest(raw: unknown): ContentManifest {
  const m = raw as Partial<ContentManifest> | null
  const ok =
    typeof m === 'object' &&
    m !== null &&
    m.version === 1 &&
    typeof m.words?.file === 'string' &&
    SENTENCE_LEVELS.every((l) => {
      const chunks = m.sentences?.[l]?.chunks
      return Array.isArray(chunks) && chunks.length > 0 && chunks.every((c) => typeof c === 'string')
    })
  if (!ok) throw new Error('Invalid content manifest')
  return m as ContentManifest
}

function parseStringList(raw: unknown, what: string): string[] {
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every((x) => typeof x === 'string')) {
    throw new Error(`Invalid ${what}`)
  }
  return raw
}

export function createLibrary(fetchJson: (path: string) => Promise<unknown>): ContentLibrary {
  const cache = new Map<string, Promise<unknown>>()
  function load<T>(path: string, parse: (raw: unknown) => T): Promise<T> {
    let p = cache.get(path) as Promise<T> | undefined
    if (!p) {
      p = fetchJson(path).then(parse)
      cache.set(path, p)
      // Forget failures so the next request retries.
      p.catch(() => cache.delete(path))
    }
    return p
  }
  const manifest = () => load('manifest.json', parseManifest)
  return {
    manifest,
    async words() {
      const m = await manifest()
      return load(m.words.file, (r) => parseStringList(r, 'word list'))
    },
    async sentences(level, chunk) {
      const files = (await manifest()).sentences[level].chunks
      const file = files[((chunk % files.length) + files.length) % files.length]
      return load(file, (r) => parseStringList(r, 'sentence chunk'))
    },
  }
}

export const library = createLibrary(async (path) => {
  const res = await fetch(`${import.meta.env.BASE_URL}content/${path}`)
  if (!res.ok) throw new Error(`Failed to load ${path}: HTTP ${res.status}`)
  return res.json()
})
