// Downloads and processes practice content into public/content/. Run: npm run content:build
// Needs network access (use a VPN if a source is blocked) and the `bunzip2` command.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chunk, cleanWordList, EXTRA_BLOCKLIST, normalizeSentence, selectSentences, SENTENCE_LEVELS, type SentenceLevel } from './clean.ts'

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

const blocklist = new Set([
  ...readFileSync(join(CACHE, 'blocklist.txt'), 'utf8')
    .split('\n')
    .map((w) => w.trim().toLowerCase())
    .filter((w) => /^[a-z]+$/.test(w)),
  ...EXTRA_BLOCKLIST,
])
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
