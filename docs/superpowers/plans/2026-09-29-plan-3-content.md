# Plan 3 — Content: Words, Sentences, Callsigns, Numbers, Q-codes, QSOs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace random letter groups with real practice material — ~45k English words, ~200k English sentences (downloaded, filtered, committed), callsigns, numbers/RST, Q-codes, QSO and contest exchanges — selectable per practice screen and scaled by difficulty level.

**Architecture:** An offline Node pipeline (`scripts/content/`) downloads Tatoeba sentences, a 50k frequency word list and a profanity blocklist, cleans and buckets them, and writes JSON chunks + a manifest to `public/content/` (committed). At runtime `src/content/library.ts` fetches and caches manifest/words/one sentence chunk at a time. Pure seeded generators in `src/content/generators/` build items; `src/training/itemSource.ts` (now async) picks the generator from the level + a new `content` setting.

**Tech Stack:** Node 24 (runs `.ts` scripts natively via type stripping), `bunzip2` CLI (pipeline only), existing React/Vite/Vitest/Playwright stack.

**Spec:** `docs/superpowers/specs/2026-09-29-morse-trainer-design.md` (§3.3 content, §3.5.1 levels)

## Global Constraints

- Allowed Morse characters: `A–Z 0–9 . , ? / = + -` and prosigns `<AR> <SK> <BT> <KN>`; every generated item must tokenize without dropping characters.
- Prosigns in content: `=` for BT, `+` for AR, `<KN>`, `<SK>`. Scoring ignores `<` and `>`.
- All randomness from seeded `mulberry32`; same seed + same data → same item.
- Sentences: length 8–80; apostrophes removed; `!` → `.`; uppercase; every word in the 50k list; no blocklisted word. Levels easy (≤30 chars, words in top 2,000), medium (≤50, top 10,000), hard (rest). Max 70,000 per level, chunks of 5,000.
- Pipeline output is committed to `public/content/`; CI never downloads content. Raw downloads live in `.cache/content/` (git-ignored).
- Runtime fetch paths: `${import.meta.env.BASE_URL}content/<file>` (works under the Pages sub-path).
- Sources and licences: Tatoeba (CC BY 2.0 FR), FrequencyWords (MIT), LDNOOBW (CC BY 4.0) — attribution in footer and `public/content/SOURCES.md`.
- Settings `schemaVersion` becomes 2 (adds `content`); v1 records migrate, keeping their values.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Content files fail to load** (offline, 404, bad JSON) — Receive must show a readable error, not crash, and the next Play must retry successfully (pinned: Task 3 library retry test; Task 8 e2e "content load failure").
2. **Clicking Next repeatedly while content is still loading** — only the newest item may play and be scored (pinned: Task 8 request-counter logic + e2e "rapid replays" at a sentence level).
3. **Generated text containing characters Morse can't send** — would be silently skipped in audio and then scored as "missed" (pinned: Task 4/5/7 tests asserting every item tokenizes losslessly).
4. **Stored v1 settings after upgrade** — speeds/level must survive, content defaults to Auto (pinned: Task 6 migration test).
5. **Typing prosigns** — `KN`, `<KN>`, `kn` must all score as correct for `<KN>` (pinned: Task 6 scoring test).

---

## File Structure

```
scripts/content/clean.ts         pure: normalizeSentence, sentenceWords, cleanWordList, sentenceLevel, selectSentences, chunk
scripts/content/clean.test.ts
scripts/content/build.ts         downloads sources, runs clean.ts, writes public/content/*
tsconfig.scripts.json            typecheck for scripts/
public/content/manifest.json     generated
public/content/words.json        generated
public/content/sentences/*.json  generated
public/content/SOURCES.md        attribution
src/content/rng.ts               + shuffle()
src/content/choices.ts           ContentType, ContentChoice, CONTENT_CHOICES
src/content/library.ts           manifest/words/sentence-chunk loader with cache + retry
src/content/generators/words.ts
src/content/generators/callsigns.ts
src/content/generators/numbers.ts   RST, serials, cut numbers, number groups, contest exchange
src/content/generators/qcodes.ts
src/content/generators/qso.ts
src/content/testing.ts           isLosslessMorse() helper for tests
src/training/itemSource.ts       async makeItem(settings, seed, library)
src/training/scoring.ts          normalizeAnswer strips < >
src/store/settings.ts            schemaVersion 2, content field, setContent
src/ui/pages/Receive.tsx         content selector, async next(), loading/error state
src/App.tsx                      footer credits
e2e/receive.spec.ts              content tests
```

---

### Task 1: Seeded shuffle and content-type choices

**Files:**
- Modify: `src/content/rng.ts`, `src/content/rng.test.ts`
- Create: `src/content/choices.ts`

**Interfaces:**
- Produces: `shuffle<T>(items: T[], rng: Rng): T[]` (in place, returns same array); `type ContentType = 'groups' | 'words' | 'sentences' | 'callsigns' | 'numbers' | 'qcodes' | 'qso' | 'contest'`; `type ContentChoice = 'auto' | ContentType`; `CONTENT_CHOICES: readonly { value: ContentChoice; label: string }[]`; `isContentChoice(x: unknown): x is ContentChoice`.

- [ ] **Step 1: Append failing tests to `src/content/rng.test.ts`**

```ts
describe('shuffle', () => {
  it('is a deterministic permutation', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], mulberry32(4))
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], mulberry32(4))
    expect(a).toEqual(b)
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(a).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})
```
and change the import line to `import { mulberry32, newSeed, pick, randInt, shuffle } from './rng'`.

- [ ] **Step 2: Run** `npx vitest run src/content/rng.test.ts` — Expected: FAIL (`shuffle is not a function`).

- [ ] **Step 3: Add to `src/content/rng.ts`**

```ts
/** Fisher–Yates shuffle in place. */
export function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let k = items.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1))
    ;[items[k], items[j]] = [items[j], items[k]]
  }
  return items
}
```

- [ ] **Step 4: Create `src/content/choices.ts`**

```ts
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
```

- [ ] **Step 5: Run** `npx vitest run src/content && npm run typecheck` — Expected: PASS, typecheck silent.

- [ ] **Step 6: Commit** — `git add src/content && git commit -m "feat(content): seeded shuffle and content-type choices" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 2: Content pipeline (clean + build) and generated data

**Files:**
- Create: `scripts/content/clean.ts`, `scripts/content/clean.test.ts`, `scripts/content/build.ts`, `tsconfig.scripts.json`, `public/content/SOURCES.md`
- Modify: `vite.config.ts` (test include), `tsconfig.json` (reference), `.gitignore`, `package.json` (script)
- Generated (committed): `public/content/manifest.json`, `public/content/words.json`, `public/content/sentences/*.json`

**Interfaces:**
- Consumes: `mulberry32`, `shuffle` from `src/content/rng.ts`.
- Produces (clean.ts): `SENTENCE_LEVELS = ['easy','medium','hard'] as const`, `type SentenceLevel`, `normalizeSentence(raw: string): string | null`, `sentenceWords(s: string): string[]`, `cleanWordList(lines: readonly string[], blocklist: ReadonlySet<string>): string[]` (lowercase, rank order), `sentenceLevel(s: string, words: readonly string[], rank: ReadonlyMap<string, number>): SentenceLevel | null`, `selectSentences(sentences, rank, blocklist, perLevel, seed): Record<SentenceLevel, string[]>`, `chunk<T>(items: readonly T[], size: number): T[][]`.
- Produces (files): manifest shape `{ version: 1, words: { file: 'words.json', count }, sentences: { easy|medium|hard: { count, chunks: string[] } }, sources: { name, url, license }[] }`; `words.json` = uppercase words in frequency order.

- [ ] **Step 1: Tooling for scripts**

`tsconfig.scripts.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.scripts.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "skipLibCheck": true,
    "module": "nodenext",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["scripts"]
}
```
Add `{ "path": "./tsconfig.scripts.json" }` to `references` in `tsconfig.json`. In `vite.config.ts` set `include: ['src/**/*.test.ts', 'scripts/**/*.test.ts']`. Append `.cache` to `.gitignore`. Run `npm pkg set scripts.content:build="node scripts/content/build.ts"`.

- [ ] **Step 2: Write failing tests** — `scripts/content/clean.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { chunk, cleanWordList, normalizeSentence, selectSentences, sentenceLevel, sentenceWords } from './clean.ts'

describe('normalizeSentence', () => {
  it('uppercases, drops apostrophes and turns ! into .', () => {
    expect(normalizeSentence("Don't do that!")).toBe('DONT DO THAT.')
    expect(normalizeSentence('It’s 5 o’clock, Tom.')).toBe('ITS 5 OCLOCK, TOM.')
  })
  it('collapses whitespace', () => {
    expect(normalizeSentence('  I   am\there. ')).toBe('I AM HERE.')
  })
  it('rejects characters Morse cannot send and bad lengths', () => {
    expect(normalizeSentence('He said "hi" to me.')).toBeNull()
    expect(normalizeSentence('Café is open now.')).toBeNull()
    expect(normalizeSentence('Hi.')).toBeNull()
    expect(normalizeSentence('A'.repeat(81))).toBeNull()
  })
})

describe('sentenceWords', () => {
  it('extracts letter-only words', () => {
    expect(sentenceWords('I HAVE 2 CATS, TOM.')).toEqual(['I', 'HAVE', 'CATS', 'TOM'])
  })
})

describe('cleanWordList', () => {
  it('keeps letter words in rank order, drops fragments, blocklisted and duplicate words', () => {
    const lines = ['you 50', "'s 40", 'don 30', 'i 20', 'x 10', 'badword 9', 'hello 8', 'hello 7', 'a 6', '']
    expect(cleanWordList(lines, new Set(['badword']))).toEqual(['you', 'i', 'hello', 'a'])
  })
})

describe('sentenceLevel', () => {
  const rank = new Map([['I', 0], ['AM', 1], ['HERE', 2], ['EXTRAORDINARY', 5000], ['OBSCURE', 20000]])
  const level = (s: string) => sentenceLevel(s, sentenceWords(s), rank)
  it('buckets by length and rarest word', () => {
    expect(level('I AM HERE.')).toBe('easy')
    expect(level('I AM EXTRAORDINARY.')).toBe('medium')
    expect(level('I AM OBSCURE.')).toBe('hard')
    expect(level('I AM HERE I AM HERE I AM HERE I AM HERE I AM HERE I AM HERE.')).toBe('hard')
  })
  it('rejects sentences with unknown words', () => {
    expect(level('I AM ZORBLAX.')).toBeNull()
  })
})

describe('selectSentences', () => {
  const rank = new Map([['I', 0], ['AM', 1], ['HERE', 2], ['BAD', 3], ['YOU', 4], ['ARE', 5], ['TOO', 6]])
  const input = ['I AM HERE.', 'I AM HERE.', 'YOU ARE HERE.', 'YOU ARE TOO.', 'I AM BAD.', 'I AM ZORBLAX.']
  it('dedupes, drops offensive and unknown-word sentences, caps per level, is deterministic', () => {
    const a = selectSentences(input, rank, new Set(['bad']), 2, 1)
    expect(a.easy).toHaveLength(2)
    expect(new Set(a.easy).size).toBe(2)
    expect(a.easy.every((s) => ['I AM HERE.', 'YOU ARE HERE.', 'YOU ARE TOO.'].includes(s))).toBe(true)
    expect(a.medium).toEqual([])
    expect(selectSentences(input, rank, new Set(['bad']), 2, 1)).toEqual(a)
  })
})

describe('chunk', () => {
  it('splits into fixed-size pieces', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})
```

- [ ] **Step 3: Run** `npx vitest run scripts` — Expected: FAIL (cannot find `./clean.ts`).

- [ ] **Step 4: Implement `scripts/content/clean.ts`**

```ts
import { mulberry32, shuffle } from '../../src/content/rng.ts'

export const SENTENCE_LEVELS = ['easy', 'medium', 'hard'] as const
export type SentenceLevel = (typeof SENTENCE_LEVELS)[number]

const MORSE_TEXT = /^[A-Z0-9 .,?/=+-]+$/
// Pieces of split contractions in subtitle word lists ("don't" → "don" + "'t").
const FRAGMENTS = new Set([
  'don', 'isn', 've', 'll', 're', 'didn', 'doesn', 'wasn', 'couldn', 'wouldn', 'shouldn',
  'aren', 'haven', 'hasn', 'weren', 'ain', 'hadn', 'mustn', 'needn', 'em',
])

export function normalizeSentence(raw: string): string | null {
  const s = raw
    .replace(/[‘’']/g, '')
    .replace(/!/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
  if (s.length < 8 || s.length > 80 || !MORSE_TEXT.test(s)) return null
  return s
}

export function sentenceWords(s: string): string[] {
  return s.split(/[^A-Z]+/).filter(Boolean)
}

export function cleanWordList(lines: readonly string[], blocklist: ReadonlySet<string>): string[] {
  const seen = new Set<string>()
  const words: string[] = []
  for (const line of lines) {
    const w = line.trim().split(/\s+/)[0] ?? ''
    if (!/^[a-z]+$/.test(w)) continue
    if (w.length === 1 && w !== 'a' && w !== 'i') continue
    if (FRAGMENTS.has(w) || blocklist.has(w) || seen.has(w)) continue
    seen.add(w)
    words.push(w)
  }
  return words
}

export function sentenceLevel(s: string, words: readonly string[], rank: ReadonlyMap<string, number>): SentenceLevel | null {
  let rarest = 0
  for (const w of words) {
    const r = rank.get(w)
    if (r === undefined) return null
    rarest = Math.max(rarest, r)
  }
  if (s.length <= 30 && rarest < 2000) return 'easy'
  if (s.length <= 50 && rarest < 10000) return 'medium'
  return 'hard'
}

export function selectSentences(
  sentences: readonly string[],
  rank: ReadonlyMap<string, number>,
  blocklist: ReadonlySet<string>,
  perLevel: number,
  seed: number,
): Record<SentenceLevel, string[]> {
  const out: Record<SentenceLevel, string[]> = { easy: [], medium: [], hard: [] }
  const seen = new Set<string>()
  for (const s of sentences) {
    if (seen.has(s)) continue
    seen.add(s)
    const words = sentenceWords(s)
    if (words.length === 0 || words.some((w) => blocklist.has(w.toLowerCase()))) continue
    const level = sentenceLevel(s, words, rank)
    if (level) out[level].push(s)
  }
  const rng = mulberry32(seed)
  for (const level of SENTENCE_LEVELS) out[level] = shuffle(out[level], rng).slice(0, perLevel)
  return out
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let k = 0; k < items.length; k += size) out.push(items.slice(k, k + size))
  return out
}
```

- [ ] **Step 5: Run** `npx vitest run scripts` — Expected: PASS (9 tests).

- [ ] **Step 6: Implement `scripts/content/build.ts`**

```ts
// Downloads and processes practice content into public/content/. Run: npm run content:build
// Needs network access (use a VPN if a source is blocked) and the `bunzip2` command.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chunk, cleanWordList, normalizeSentence, selectSentences, SENTENCE_LEVELS, type SentenceLevel } from './clean.ts'

const CACHE = '.cache/content'
const OUT = 'public/content'
const PER_LEVEL = 70_000
const CHUNK_SIZE = 5_000
const SEED = 20260929

const SOURCES = [
  {
    name: 'Tatoeba English sentences',
    url: 'https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2',
    license: 'CC BY 2.0 FR',
    file: 'eng_sentences.tsv.bz2',
  },
  {
    name: 'FrequencyWords English 50k (OpenSubtitles 2018)',
    url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt',
    license: 'MIT',
    file: 'en_50k.txt',
  },
  {
    name: 'LDNOOBW English blocklist',
    url: 'https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en',
    license: 'CC BY 4.0',
    file: 'blocklist.txt',
  },
]

async function download(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) return
  console.log(`downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

mkdirSync(CACHE, { recursive: true })
for (const s of SOURCES) await download(s.url, join(CACHE, s.file))
const tsv = join(CACHE, 'eng_sentences.tsv')
if (!existsSync(tsv)) execFileSync('bunzip2', ['-k', join(CACHE, 'eng_sentences.tsv.bz2')])

const blocklist = new Set(
  readFileSync(join(CACHE, 'blocklist.txt'), 'utf8')
    .split('\n')
    .map((w) => w.trim().toLowerCase())
    .filter((w) => /^[a-z]+$/.test(w)),
)
const words = cleanWordList(readFileSync(join(CACHE, 'en_50k.txt'), 'utf8').split('\n'), blocklist)
const rank = new Map(words.map((w, k) => [w.toUpperCase(), k]))

const sentences: string[] = []
for (const line of readFileSync(tsv, 'utf8').split('\n')) {
  const s = normalizeSentence(line.split('\t')[2] ?? '')
  if (s) sentences.push(s)
}
const selected = selectSentences(sentences, rank, blocklist, PER_LEVEL, SEED)

rmSync(join(OUT, 'sentences'), { recursive: true, force: true })
mkdirSync(join(OUT, 'sentences'), { recursive: true })
writeFileSync(join(OUT, 'words.json'), JSON.stringify(words.map((w) => w.toUpperCase())))

const sentenceIndex = {} as Record<SentenceLevel, { count: number; chunks: string[] }>
for (const level of SENTENCE_LEVELS) {
  const files = chunk(selected[level], CHUNK_SIZE).map((part, k) => {
    const file = `sentences/${level}-${k}.json`
    writeFileSync(join(OUT, file), JSON.stringify(part))
    return file
  })
  if (files.length === 0) throw new Error(`no ${level} sentences selected`)
  sentenceIndex[level] = { count: selected[level].length, chunks: files }
}

const manifest = {
  version: 1,
  words: { file: 'words.json', count: words.length },
  sentences: sentenceIndex,
  sources: SOURCES.map(({ name, url, license }) => ({ name, url, license })),
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(
  `words: ${words.length}; sentences: ` +
    SENTENCE_LEVELS.map((l) => `${l} ${sentenceIndex[l].count} (${sentenceIndex[l].chunks.length} files)`).join(', '),
)
```

- [ ] **Step 7: Create `public/content/SOURCES.md`**

```markdown
# Practice content sources

Generated by `npm run content:build` (see `scripts/content/`). Text was filtered and
normalized (uppercased, apostrophes removed, `!` → `.`); offensive words removed.

- **Sentences** — [Tatoeba](https://tatoeba.org) English sentences,
  licensed [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/).
- **Word frequencies** — [FrequencyWords](https://github.com/hermitdave/FrequencyWords)
  by Hermit Dave (OpenSubtitles 2018), MIT licence.
- **Blocklist used for filtering** — [LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words),
  CC BY 4.0.
```

- [ ] **Step 8: Run the pipeline**

Run: `npm run content:build`
Expected: prints `words: ~46000; sentences: easy N (k files), medium 70000 (14 files), hard 70000 (14 files)` with every level > 0 files; `public/content/` contains `manifest.json`, `words.json`, `sentences/*.json`. Then check size: `du -sh public/content` — expected under 12 MB.

- [ ] **Step 9: Verify all checks**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add scripts tsconfig.json tsconfig.scripts.json vite.config.ts .gitignore package.json public/content
git commit -m "feat(content): download pipeline for English words and Tatoeba sentences" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Runtime content library

**Files:**
- Create: `src/content/library.ts`, `src/content/library.test.ts`

**Interfaces:**
- Produces: `SENTENCE_LEVELS`, `type SentenceLevel` (same values as the pipeline); `interface ContentManifest { version: 1; words: { file: string; count: number }; sentences: Record<SentenceLevel, { count: number; chunks: string[] }>; sources: { name: string; url: string; license: string }[] }`; `parseManifest(raw: unknown): ContentManifest`; `interface ContentLibrary { manifest(): Promise<ContentManifest>; words(): Promise<readonly string[]>; sentences(level: SentenceLevel, chunk: number): Promise<readonly string[]> }`; `createLibrary(fetchJson: (path: string) => Promise<unknown>): ContentLibrary`; singleton `library`.

- [ ] **Step 1: Write failing tests** — `src/content/library.test.ts`

```ts
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
```

- [ ] **Step 2: Run** `npx vitest run src/content/library.test.ts` — Expected: FAIL (cannot find `./library`).

- [ ] **Step 3: Implement `src/content/library.ts`**

```ts
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
```

- [ ] **Step 4: Run** `npx vitest run src/content/library.test.ts && npm run typecheck` — Expected: PASS (5 tests).

- [ ] **Step 5: Commit** — `git add src/content && git commit -m "feat(content): cached runtime loader for words and sentence chunks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 4: Word and callsign generators

**Files:**
- Create: `src/content/testing.ts`, `src/content/generators/words.ts`, `src/content/generators/words.test.ts`, `src/content/generators/callsigns.ts`, `src/content/generators/callsigns.test.ts`

**Interfaces:**
- Consumes: `Rng`, `pick`, `randInt` (rng.ts), `tokenize` (morse/table.ts).
- Produces: `isLosslessMorse(text: string): boolean`; `interface WordOptions { count: number; maxRank: number; minLen: number; maxLen: number }`; `generateWords(rng: Rng, words: readonly string[], o: WordOptions): string`; `generateCallsign(rng: Rng, allowPortable?: boolean): string`; `CALLSIGN_PATTERN: RegExp`.

- [ ] **Step 1: Create `src/content/testing.ts`** (test helper, used by generator tests)

```ts
import { tokenize } from '../morse/table'

/** True when every non-space character of `text` becomes a Morse token (nothing silently dropped). */
export function isLosslessMorse(text: string): boolean {
  return tokenize(text).filter((t) => t !== ' ').join('') === text.toUpperCase().replace(/\s+/g, '')
}
```

- [ ] **Step 2: Write failing tests**

`src/content/generators/words.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../rng'
import { generateWords } from './words'

const WORDS = ['I', 'THE', 'AND', 'HOUSE', 'BEAUTIFUL', 'A', 'CAT']

describe('generateWords', () => {
  it('draws count words from the top maxRank within the length range', () => {
    const text = generateWords(mulberry32(1), WORDS, { count: 20, maxRank: 5, minLen: 2, maxLen: 5 })
    const words = text.split(' ')
    expect(words).toHaveLength(20)
    for (const w of words) expect(['THE', 'AND', 'HOUSE']).toContain(w)
  })

  it('is deterministic', () => {
    const o = { count: 5, maxRank: 7, minLen: 1, maxLen: 9 }
    expect(generateWords(mulberry32(3), WORDS, o)).toBe(generateWords(mulberry32(3), WORDS, o))
  })

  it('throws when no word qualifies', () => {
    expect(() => generateWords(mulberry32(1), WORDS, { count: 1, maxRank: 2, minLen: 6, maxLen: 9 })).toThrow(/no words/)
  })
})
```

`src/content/generators/callsigns.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../rng'
import { isLosslessMorse } from '../testing'
import { CALLSIGN_PATTERN, generateCallsign } from './callsigns'

describe('generateCallsign', () => {
  it('produces valid, sendable callsigns with variety', () => {
    const rng = mulberry32(8)
    const calls = Array.from({ length: 2000 }, () => generateCallsign(rng))
    for (const c of calls) {
      expect(c).toMatch(CALLSIGN_PATTERN)
      expect(isLosslessMorse(c)).toBe(true)
    }
    expect(new Set(calls).size).toBeGreaterThan(1900)
    expect(calls.some((c) => c.endsWith('/P'))).toBe(true)
    expect(calls.some((c) => /^[KWN]/.test(c))).toBe(true)
    expect(calls.some((c) => c.startsWith('DL'))).toBe(true)
  })

  it('can exclude portable suffixes', () => {
    const rng = mulberry32(2)
    for (let k = 0; k < 500; k++) expect(generateCallsign(rng, false)).not.toContain('/')
  })
})
```

- [ ] **Step 3: Run** `npx vitest run src/content/generators` — Expected: FAIL (cannot find `./words`, `./callsigns`).

- [ ] **Step 4: Implement `src/content/generators/words.ts`**

```ts
import { pick, type Rng } from '../rng'

export interface WordOptions {
  count: number
  /** Only the `maxRank` most frequent words are eligible. */
  maxRank: number
  minLen: number
  maxLen: number
}

export function generateWords(rng: Rng, words: readonly string[], { count, maxRank, minLen, maxLen }: WordOptions): string {
  const pool = words.slice(0, maxRank).filter((w) => w.length >= minLen && w.length <= maxLen)
  if (pool.length === 0) throw new Error(`no words for rank ≤ ${maxRank}, length ${minLen}..${maxLen}`)
  return Array.from({ length: count }, () => pick(rng, pool)).join(' ')
}
```

- [ ] **Step 5: Implement `src/content/generators/callsigns.ts`**

```ts
import { pick, randInt, type Rng } from '../rng'

// Real ITU prefixes grouped by typical suffix length; the digit after the prefix is the call area.
const RULES: readonly { prefixes: readonly string[]; suffix: readonly [number, number] }[] = [
  { prefixes: ['K', 'W', 'N'], suffix: [1, 3] },
  {
    prefixes: ['AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AI', 'AJ', 'AK', 'KA', 'KB', 'KC', 'KD', 'KE', 'KF', 'KG',
      'KI', 'KJ', 'KK', 'KN', 'KO', 'WA', 'WB', 'WD', 'KH', 'KP', 'KL'],
    suffix: [1, 3],
  },
  { prefixes: ['VE', 'VA', 'G', 'M', '2E', 'GM', 'GW', 'GI', 'EI'], suffix: [2, 3] },
  {
    prefixes: ['F', 'DL', 'DK', 'DJ', 'DO', 'I', 'IK', 'IZ', 'EA', 'ON', 'PA', 'PD', 'OH', 'SM', 'LA', 'OZ', 'OK', 'OM',
      'SP', 'SQ', 'HA', 'YO', 'LZ', 'S5', '9A', 'YU', 'OE', 'HB', 'CT', 'UA', 'UR', 'EP', 'EK', '4X', 'A6'],
    suffix: [2, 3],
  },
  { prefixes: ['JA', 'JH', 'JR', 'BY', 'BG', 'HL', 'DU', 'YB', 'VU', 'VK', 'ZL', 'ZS', 'PY', 'LU', 'CE', 'XE'], suffix: [2, 3] },
]

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const CALLSIGN_PATTERN = /^[A-Z0-9]{1,3}[0-9][A-Z]{1,3}(\/[PM])?$/

export function generateCallsign(rng: Rng, allowPortable = true): string {
  const rule = pick(rng, RULES)
  const len = randInt(rng, rule.suffix[0], rule.suffix[1])
  let suffix = ''
  for (let k = 0; k < len; k++) suffix += LETTERS[Math.floor(rng() * LETTERS.length)]
  const call = `${pick(rng, rule.prefixes)}${randInt(rng, 0, 9)}${suffix}`
  if (!allowPortable) return call
  const r = rng()
  return r < 0.06 ? `${call}/P` : r < 0.09 ? `${call}/M` : call
}
```

- [ ] **Step 6: Run** `npx vitest run src/content/generators` — Expected: PASS (groups 3, words 3, callsigns 2).

- [ ] **Step 7: Commit** — `git add src/content && git commit -m "feat(content): word and callsign generators" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 5: Numbers, Q-codes, QSO and contest generators

**Files:**
- Create: `src/content/generators/numbers.ts`, `numbers.test.ts`, `qcodes.ts`, `qcodes.test.ts`, `qso.ts`, `qso.test.ts` (all in `src/content/generators/`)

**Interfaces:**
- Consumes: `generateCallsign` (Task 4), `pick`, `randInt`, `Rng`.
- Produces: `generateRst(rng): string`, `generateSerial(rng): string`, `cutNumbers(s: string): string`, `generateNumberGroup(rng, count: number): string`, `generateContestExchange(rng): string`; `QCODES`, `ABBREVIATIONS: readonly { code: string; meaning: string }[]`, `generateQcodes(rng, count: number): string`; `generateQsoScript(rng): string[]`.

- [ ] **Step 1: Write failing tests**

`numbers.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../rng'
import { isLosslessMorse } from '../testing'
import { cutNumbers, generateContestExchange, generateNumberGroup, generateRst, generateSerial } from './numbers'

describe('numbers', () => {
  const rng = mulberry32(6)
  it('RST reports are realistic', () => {
    for (let k = 0; k < 200; k++) expect(generateRst(rng)).toMatch(/^[3-5][3-9]9$/)
  })
  it('serials are 001–999', () => {
    for (let k = 0; k < 200; k++) {
      const s = generateSerial(rng)
      expect(s).toMatch(/^\d{3}$/)
      expect(Number(s)).toBeGreaterThan(0)
    }
  })
  it('cut numbers replace 0 with T and 9 with N', () => {
    expect(cutNumbers('5990')).toBe('5NNT')
  })
  it('number groups have count entries of digits', () => {
    expect(generateNumberGroup(rng, 5)).toMatch(/^\d{1,4}( \d{1,4}){4}$/)
  })
  it('contest exchanges are call 5NN serial and sendable', () => {
    for (let k = 0; k < 200; k++) {
      const x = generateContestExchange(rng)
      expect(x).toMatch(/^[A-Z0-9]{1,3}[0-9][A-Z]{1,3} 5NN [0-9TN]{3}$/)
      expect(isLosslessMorse(x)).toBe(true)
    }
  })
})
```

`qcodes.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../rng'
import { isLosslessMorse } from '../testing'
import { ABBREVIATIONS, generateQcodes, QCODES } from './qcodes'

describe('qcodes', () => {
  it('every code is sendable and has a meaning', () => {
    for (const q of [...QCODES, ...ABBREVIATIONS]) {
      expect(isLosslessMorse(q.code), q.code).toBe(true)
      expect(q.meaning.length).toBeGreaterThan(0)
    }
  })
  it('generates count codes', () => {
    expect(generateQcodes(mulberry32(1), 5).split(' ')).toHaveLength(5)
  })
})
```

`qso.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../rng'
import { isLosslessMorse } from '../testing'
import { generateQsoScript } from './qso'

describe('generateQsoScript', () => {
  it('is a deterministic, sendable, complete QSO between two stations', () => {
    const script = generateQsoScript(mulberry32(12))
    expect(generateQsoScript(mulberry32(12))).toEqual(script)
    expect(script.length).toBeGreaterThanOrEqual(5)
    for (const line of script) expect(isLosslessMorse(line), line).toBe(true)
    expect(script[0]).toMatch(/^CQ CQ CQ DE /)
    expect(script.at(-1)).toContain('<SK>')
    const caller = script[0].split(' ')[4]
    expect(script[1]).toContain(caller)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/content/generators` — Expected: FAIL (cannot find the three modules).

- [ ] **Step 3: Implement `src/content/generators/numbers.ts`**

```ts
import { randInt, type Rng } from '../rng'
import { generateCallsign } from './callsigns'

export function generateRst(rng: Rng): string {
  return `${randInt(rng, 3, 5)}${randInt(rng, 3, 9)}9`
}

export function generateSerial(rng: Rng): string {
  return String(randInt(rng, 1, 999)).padStart(3, '0')
}

/** Contest "cut numbers": 0 is sent as T and 9 as N. */
export function cutNumbers(s: string): string {
  return s.replace(/0/g, 'T').replace(/9/g, 'N')
}

export function generateNumberGroup(rng: Rng, count: number): string {
  const makers = [() => generateRst(rng), () => generateSerial(rng), () => String(randInt(rng, 0, 9999))]
  return Array.from({ length: count }, () => makers[randInt(rng, 0, makers.length - 1)]()).join(' ')
}

export function generateContestExchange(rng: Rng): string {
  return `${generateCallsign(rng, false)} 5NN ${cutNumbers(generateSerial(rng))}`
}
```

- [ ] **Step 4: Implement `src/content/generators/qcodes.ts`**

```ts
import { pick, type Rng } from '../rng'

export interface Code {
  code: string
  meaning: string
}

export const QCODES: readonly Code[] = [
  { code: 'QRL', meaning: 'Is the frequency in use?' },
  { code: 'QRM', meaning: 'Interference from other stations' },
  { code: 'QRN', meaning: 'Static / atmospheric noise' },
  { code: 'QRO', meaning: 'Increase power' },
  { code: 'QRP', meaning: 'Reduce power / low power' },
  { code: 'QRQ', meaning: 'Send faster' },
  { code: 'QRS', meaning: 'Send slower' },
  { code: 'QRT', meaning: 'Stop sending / closing station' },
  { code: 'QRU', meaning: 'Nothing more for you' },
  { code: 'QRV', meaning: 'I am ready' },
  { code: 'QRX', meaning: 'Wait / stand by' },
  { code: 'QRZ', meaning: 'Who is calling me?' },
  { code: 'QSB', meaning: 'Your signal is fading' },
  { code: 'QSL', meaning: 'I acknowledge receipt' },
  { code: 'QSO', meaning: 'A contact' },
  { code: 'QSY', meaning: 'Change frequency' },
  { code: 'QTH', meaning: 'My location is' },
  { code: 'QTR', meaning: 'The correct time is' },
]

export const ABBREVIATIONS: readonly Code[] = [
  { code: 'ABT', meaning: 'about' },
  { code: 'AGN', meaning: 'again' },
  { code: 'ANT', meaning: 'antenna' },
  { code: 'BK', meaning: 'break' },
  { code: 'CFM', meaning: 'confirm' },
  { code: 'CQ', meaning: 'calling any station' },
  { code: 'CUL', meaning: 'see you later' },
  { code: 'DE', meaning: 'from / this is' },
  { code: 'DR', meaning: 'dear' },
  { code: 'ES', meaning: 'and' },
  { code: 'FB', meaning: 'fine business (excellent)' },
  { code: 'FER', meaning: 'for' },
  { code: 'GA', meaning: 'good afternoon / go ahead' },
  { code: 'GE', meaning: 'good evening' },
  { code: 'GM', meaning: 'good morning' },
  { code: 'GL', meaning: 'good luck' },
  { code: 'HR', meaning: 'here' },
  { code: 'HW', meaning: 'how (copy)?' },
  { code: 'OM', meaning: 'old man (fellow operator)' },
  { code: 'OP', meaning: 'operator' },
  { code: 'PSE', meaning: 'please' },
  { code: 'PWR', meaning: 'power' },
  { code: 'RIG', meaning: 'radio equipment' },
  { code: 'RPT', meaning: 'report / repeat' },
  { code: 'RST', meaning: 'readability, strength, tone' },
  { code: 'SRI', meaning: 'sorry' },
  { code: 'TNX', meaning: 'thanks' },
  { code: 'TU', meaning: 'thank you' },
  { code: 'UR', meaning: 'your / you are' },
  { code: 'WX', meaning: 'weather' },
  { code: '73', meaning: 'best regards' },
  { code: '88', meaning: 'love and kisses' },
  { code: '5NN', meaning: '599 in cut numbers' },
]

export function generateQcodes(rng: Rng, count: number): string {
  const all = [...QCODES, ...ABBREVIATIONS]
  return Array.from({ length: count }, () => pick(rng, all).code).join(' ')
}
```

- [ ] **Step 5: Implement `src/content/generators/qso.ts`**

```ts
import { pick, randInt, type Rng } from '../rng'
import { generateCallsign } from './callsigns'
import { generateRst } from './numbers'

const NAMES = ['JOHN', 'BOB', 'MIKE', 'DAVE', 'TOM', 'JIM', 'BILL', 'ED', 'AL', 'JOE', 'ANN', 'SUE', 'MARY', 'LIZ',
  'PETER', 'HANS', 'KLAUS', 'PIERRE', 'MARCO', 'JUAN', 'IVAN', 'ALI', 'REZA', 'KEN', 'YUKI', 'RAJ', 'LEO', 'MAX']
const QTHS = ['BOSTON', 'DENVER', 'TEXAS', 'OHIO', 'LONDON', 'PARIS', 'BERLIN', 'MUNICH', 'ROME', 'MADRID',
  'TOKYO', 'SYDNEY', 'TORONTO', 'TEHRAN', 'MOSCOW', 'WARSAW', 'PRAGUE', 'VIENNA', 'OSLO', 'DUBLIN', 'LISBON']
const RIGS = ['IC7300', 'IC7610', 'FT991', 'FTDX10', 'K3', 'K4', 'KX2', 'TS590', 'QCX', 'HOMEBREW']
const ANTS = ['DIPOLE', 'YAGI', 'VERTICAL', 'EFHW', 'LOOP', 'WIRE', 'GP']
const WX = ['SUNNY', 'CLOUDY', 'RAIN', 'SNOW', 'FOGGY', 'WINDY', 'HOT', 'COLD']
const GREETINGS = ['GM', 'GA', 'GE']

/** A complete ragchew QSO. Station A calls CQ, B answers. BT = "=", AR = "+". */
export function generateQsoScript(rng: Rng): string[] {
  const a = generateCallsign(rng, false)
  const b = generateCallsign(rng, false)
  const [nameA, nameB] = [pick(rng, NAMES), pick(rng, NAMES)]
  const [qthA, qthB] = [pick(rng, QTHS), pick(rng, QTHS)]
  const [rstA, rstB] = [generateRst(rng), generateRst(rng)]
  const greet = pick(rng, GREETINGS)
  const temp = randInt(rng, -10, 35)
  return [
    `CQ CQ CQ DE ${a} ${a} K`,
    `${a} DE ${b} ${b} K`,
    `${b} DE ${a} ${greet} TNX FER CALL = UR RST ${rstB} ${rstB} = NAME ${nameA} ${nameA} = QTH ${qthA} ${qthA} = HW? + ${b} DE ${a} <KN>`,
    `${a} DE ${b} R ${greet} ${nameA} TNX FER RPT = UR RST ${rstA} ${rstA} = NAME ${nameB} ${nameB} = QTH ${qthB} ${qthB} = RIG ${pick(rng, RIGS)} ES ANT ${pick(rng, ANTS)} = WX ${pick(rng, WX)} ${temp < 0 ? 'MINUS ' : ''}${Math.abs(temp)}C + ${a} DE ${b} <KN>`,
    `${b} DE ${a} R FB ${nameB} TNX FER QSO = 73 ES GL + ${b} DE ${a} <SK>`,
    `${a} DE ${b} TU ${nameA} 73 <SK> EE`,
  ]
}
```

- [ ] **Step 6: Run** `npx vitest run src/content` — Expected: PASS.

- [ ] **Step 7: Commit** — `git add src/content && git commit -m "feat(content): numbers, Q-codes, QSO and contest generators" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 6: Settings v2 (content choice) and prosign-tolerant scoring

**Files:**
- Modify: `src/store/settings.ts`, `src/store/settings.test.ts`, `src/training/scoring.ts`, `src/training/scoring.test.ts`

**Interfaces:**
- Consumes: `ContentChoice`, `isContentChoice` (Task 1).
- Produces: `Settings.schemaVersion: 2`, `Settings.content: ContentChoice` (default `'auto'`), `setContent(s: Settings, content: ContentChoice): Settings`; `normalizeAnswer` also removes `<` and `>`.

- [ ] **Step 1: Write failing tests**

Append to `src/store/settings.test.ts` (add `setContent` to the import list):
```ts
describe('settings v2', () => {
  it('defaults content to auto', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ schemaVersion: 2, content: 'auto' })
  })

  it('migrates a v1 record, keeping its values', () => {
    const s = migrateSettings({ schemaVersion: 1, level: 'custom', charWpm: 28, effWpm: 20, linkSpeeds: false, extraWordGap: 0, pitchHz: 650, volume: 0.4 })
    expect(s).toMatchObject({ schemaVersion: 2, content: 'auto', level: 'custom', charWpm: 28, effWpm: 20, pitchHz: 650 })
  })

  it('keeps a valid content choice and rejects unknown ones', () => {
    expect(migrateSettings({ ...DEFAULT_SETTINGS, content: 'sentences' }).content).toBe('sentences')
    expect(migrateSettings({ ...DEFAULT_SETTINGS, content: 'klingon' }).content).toBe('auto')
  })

  it('setContent changes only the content choice', () => {
    expect(setContent(DEFAULT_SETTINGS, 'qso')).toEqual({ ...DEFAULT_SETTINGS, content: 'qso' })
  })
})
```

Append to `src/training/scoring.test.ts`:
```ts
describe('prosigns', () => {
  it('scores KN, <KN> and kn the same against <KN>', () => {
    for (const typed of ['KN', '<KN>', 'kn']) expect(score('<KN>', typed).accuracy).toBe(1)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/store src/training` — Expected: FAIL (`schemaVersion` is 1; `setContent` missing; `<KN>` accuracy < 1).

- [ ] **Step 3: Update `src/store/settings.ts`**

- Add `import { isContentChoice, type ContentChoice } from '../content/choices'`.
- In `Settings`: change `schemaVersion: 1` to `schemaVersion: 2` and add `content: ContentChoice` after `level`.
- In `DEFAULT_SETTINGS`: `schemaVersion: 2`, add `content: 'auto'`.
- In `migrateSettings`: replace `if (r.schemaVersion !== 1) return DEFAULT_SETTINGS` with `if (r.schemaVersion !== 1 && r.schemaVersion !== 2) return DEFAULT_SETTINGS`; in the returned object use `schemaVersion: 2` and add `content: isContentChoice(r.content) ? r.content : DEFAULT_SETTINGS.content,` after `level`.
- Add:
```ts
export function setContent(s: Settings, content: ContentChoice): Settings {
  return { ...s, content }
}
```

- [ ] **Step 4: Update `normalizeAnswer` in `src/training/scoring.ts`**

```ts
export function normalizeAnswer(s: string): string {
  // Prosigns are shown as <KN>; typing KN counts the same.
  return s.toUpperCase().replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
}
```

- [ ] **Step 5: Run** `npx vitest run src/store src/training && npm run typecheck` — Expected: PASS; typecheck will report `makeItem` callers only if types changed (they did not yet).

- [ ] **Step 6: Commit** — `git add src/store src/training && git commit -m "feat: settings v2 with content choice; prosign-tolerant scoring" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 7: Async item source

**Files:**
- Modify (replace whole file): `src/training/itemSource.ts`, `src/training/itemSource.test.ts`

**Interfaces:**
- Consumes: all generators (Tasks 4–5), `generateGroups` (Plan 1), `ContentLibrary`, `SentenceLevel` (Task 3), `ContentType`, `ContentChoice` (Task 1), `Settings` (Task 6), `getLevel`, `Level` (difficulty).
- Produces: `interface ExerciseItem { text: string; kind: ContentType; seed: number }`; `resolveKind(level: Settings['level'], choice: ContentChoice, rng: Rng): ContentType`; `makeItem(s: Pick<Settings, 'level' | 'content'>, seed: number, lib: ContentLibrary): Promise<ExerciseItem>`.

- [ ] **Step 1: Replace `src/training/itemSource.test.ts`**

```ts
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
```

- [ ] **Step 2: Run** `npx vitest run src/training/itemSource.test.ts` — Expected: FAIL (makeItem signature/kind mismatch).

- [ ] **Step 3: Replace `src/training/itemSource.ts`**

```ts
import type { ContentChoice, ContentType } from '../content/choices'
import { generateCallsign } from '../content/generators/callsigns'
import { generateGroups } from '../content/generators/groups'
import { generateContestExchange, generateNumberGroup } from '../content/generators/numbers'
import { generateQcodes } from '../content/generators/qcodes'
import { generateQsoScript } from '../content/generators/qso'
import { generateWords } from '../content/generators/words'
import type { ContentLibrary, SentenceLevel } from '../content/library'
import { mulberry32, pick, type Rng } from '../content/rng'
import { DIGITS, LETTERS } from '../morse/table'
import type { Settings } from '../store/settings'
import { getLevel, type Level } from './difficulty'

export interface ExerciseItem {
  text: string
  kind: ContentType
  seed: number
}

const CHARSET = LETTERS + DIGITS
const WORD_MAX_RANK: Record<Level, number> = { 1: 300, 2: 1000, 3: 5000, 4: 15000, 5: 30000, 6: 50000 }
const WORD_MAX_LEN: Record<Level, number> = { 1: 4, 2: 5, 3: 7, 4: 9, 5: 12, 6: 20 }
const SENTENCE_LEVEL: Record<Level, SentenceLevel> = { 1: 'easy', 2: 'easy', 3: 'medium', 4: 'medium', 5: 'hard', 6: 'hard' }

/** 'custom' speed settings get middle-of-the-road content. */
const levelNumber = (level: Settings['level']): Level => (level === 'custom' ? 3 : level)

export function resolveKind(level: Settings['level'], choice: ContentChoice, rng: Rng): ContentType {
  if (choice !== 'auto') return choice
  const content = getLevel(levelNumber(level)).content
  switch (content) {
    case 'chars':
      return 'groups'
    case 'short-words':
      return 'words'
    case 'words-callsigns':
      return rng() < 0.5 ? 'words' : 'callsigns'
    case 'sentences-qso':
      return rng() < 0.5 ? 'sentences' : 'qso'
    case 'callsigns-serials':
      return 'contest'
  }
}

async function textFor(kind: ContentType, n: Level, rng: Rng, lib: ContentLibrary): Promise<string> {
  switch (kind) {
    case 'groups':
      return generateGroups(rng, n === 1
        ? { charset: CHARSET, minLen: 1, maxLen: 3, count: 3 }
        : { charset: CHARSET, minLen: 5, maxLen: 5, count: 5 })
    case 'words':
      return generateWords(rng, await lib.words(), { count: 5, maxRank: WORD_MAX_RANK[n], minLen: 1, maxLen: WORD_MAX_LEN[n] })
    case 'sentences': {
      const level = SENTENCE_LEVEL[n]
      const chunks = (await lib.manifest()).sentences[level].chunks.length
      return pick(rng, await lib.sentences(level, Math.floor(rng() * chunks)))
    }
    case 'callsigns':
      return Array.from({ length: 4 }, () => generateCallsign(rng)).join(' ')
    case 'numbers':
      return generateNumberGroup(rng, 5)
    case 'qcodes':
      return generateQcodes(rng, 5)
    case 'qso':
      return pick(rng, generateQsoScript(rng))
    case 'contest':
      return Array.from({ length: 2 }, () => generateContestExchange(rng)).join(' ')
  }
}

export async function makeItem(s: Pick<Settings, 'level' | 'content'>, seed: number, lib: ContentLibrary): Promise<ExerciseItem> {
  const rng = mulberry32(seed)
  const kind = resolveKind(s.level, s.content, rng)
  return { text: await textFor(kind, levelNumber(s.level), rng, lib), kind, seed }
}
```

- [ ] **Step 4: Run** `npx vitest run src/training` — Expected: PASS. (`npm run typecheck` fails in `Receive.tsx` until Task 8 — expected.)

- [ ] **Step 5: Commit** — `git add src/training && git commit -m "feat(training): async item source over all content types" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 8: Receive page content selector, loading/error states, credits

**Files:**
- Modify: `src/ui/pages/Receive.tsx`, `src/App.tsx`, `src/index.css`, `e2e/receive.spec.ts`

**Interfaces:**
- Consumes: `makeItem` (Task 7), `library` (Task 3), `CONTENT_CHOICES`, `ContentChoice` (Task 1), `setContent` (Task 6).
- Produces: select labelled "Content type"; status `Loading…`; error text in `role="alert"`; footer credits.

- [ ] **Step 1: Update e2e tests first** — in `e2e/receive.spec.ts`:

Replace `openReceiveAtContestSpeed` with:
```ts
async function openReceiveAtContestSpeed(page: Page, content = 'groups') {
  await page.goto('/#/receive')
  await page.getByLabel('Difficulty level').selectOption('6')
  await page.getByLabel('Content type').selectOption(content)
}
```
Append:
```ts
test('words and sentences come from the downloaded content', async ({ page }) => {
  const errors = collectErrors(page)
  for (const [content, pattern] of [
    ['words', /^[A-Z]+( [A-Z]+){4}$/],
    ['sentences', /^[A-Z0-9 .,?/=+-]{8,80}$/],
  ] as const) {
    await openReceiveAtContestSpeed(page, content)
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByRole('status')).toHaveText('Playing…')
    await page.getByLabel('Type what you hear').press('Enter')
    await expect(page.getByTestId('sent-text')).toHaveText(pattern)
  }
  expect(errors).toEqual([])
})

test('a content load failure shows a message and the next try recovers', async ({ page }) => {
  await page.route('**/content/**', (route) => route.abort())
  await openReceiveAtContestSpeed(page, 'sentences')
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByRole('alert')).toContainText("Couldn't load practice content")
  await page.unroute('**/content/**')
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByRole('status')).toHaveText('Playing…')
  await expect(page.getByRole('alert')).toHaveCount(0)
})
```
In `'plays an item and scores the typed answer'` keep the 5×5 regex (content is `groups` by default in the helper).

- [ ] **Step 2: Run** `npm run test:e2e` — Expected: FAIL (no "Content type" select).

- [ ] **Step 3: Update `src/ui/pages/Receive.tsx`**

- Imports: add `import { library } from '../../content/library'`, `import { CONTENT_CHOICES, type ContentChoice } from '../../content/choices'`; change `import { nudgeSpeed, type Settings } from '../../store/settings'` to `import { nudgeSpeed, setContent, type Settings } from '../../store/settings'`.
- `type Status = 'ready' | 'loading' | 'playing' | 'finished'` and `STATUS_TEXT` gains `loading: 'Loading…'`.
- Add state `const [error, setError] = useState<string | null>(null)` and `const requestRef = useRef(0)`.
- Replace `next` with:
```tsx
  const next = useCallback(async () => {
    // Only the newest request may play: rapid clicks while content loads are ignored.
    const request = ++requestRef.current
    handleRef.current = null
    engine.stop()
    setItem(null)
    setAnswer('')
    setResult(null)
    setError(null)
    setStatus('loading')
    try {
      const it = await makeItem(settings, newSeed(), library)
      if (request !== requestRef.current) return
      setItem(it)
      play(it)
    } catch {
      if (request !== requestRef.current) return
      setStatus('ready')
      setError("Couldn't load practice content. Check your connection and press Play to try again.")
    }
  }, [settings, play])
```
- In the keyboard handler, `next()` becomes `void next()`; the Play button `onClick={() => void next()}`.
- Before `<div className="controls">` add:
```tsx
      <label className="field content-field">
        <span>Content</span>
        <select
          aria-label="Content type"
          value={settings.content}
          onChange={(e) => update((s) => setContent(s, e.target.value as ContentChoice))}
        >
          {CONTENT_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
```
- After the controls `div` add:
```tsx
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
```

- [ ] **Step 4: Footer credits in `src/App.tsx`** — after `<main>…</main>` add:
```tsx
      <footer className="app-footer">
        Sentences from <a href="https://tatoeba.org">Tatoeba</a> (CC BY 2.0 FR) · word frequencies from{' '}
        <a href="https://github.com/hermitdave/FrequencyWords">FrequencyWords</a> (MIT) ·{' '}
        <a href={`${import.meta.env.BASE_URL}content/SOURCES.md`}>sources</a>
      </footer>
```

- [ ] **Step 5: Append styles to `src/index.css`**
```css
.content-field { margin-bottom: 1rem; max-width: 20rem; }
.error { color: var(--bad); background: var(--surface); border: 1px solid var(--bad); border-radius: 8px; padding: 0.6rem 0.9rem; }
.app-footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.8rem; }
```

- [ ] **Step 6: Run everything**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e`
Expected: all green; e2e 7 passed.

- [ ] **Step 7: Commit** — `git add src e2e && git commit -m "feat(ui): content type selector with loading and error states; source credits" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

- [ ] **Step 8: Deploy** — merge to `main`, push (`git push origin main`), and watch the Deploy workflow (`gh run watch <id> -R Neo-vortex/AmatureRadioMorsePractice --exit-status`). Verify `https://neo-vortex.github.io/AmatureRadioMorsePractice/content/manifest.json` returns 200.
