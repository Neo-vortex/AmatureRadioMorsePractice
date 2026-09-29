# Plan 1 — Foundation: Scaffold, CI/CD, Morse Core, Clean Receive Mode

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed (GitHub Pages) React app where the user picks a difficulty level / speed, hears clean Morse code of random character groups, types what they heard, and gets a per-character score.

**Architecture:** Framework-free TypeScript modules for Morse timing/encoding (`src/morse`), seeded content (`src/content`), scoring and difficulty (`src/training`), settings (`src/store`) and Web Audio playback (`src/audio`); React (`src/ui`, `src/App.tsx`) only renders and wires them. Hash routing so GitHub Pages needs no server rewrites. CI runs lint/typecheck/unit/e2e; deploy publishes to Pages and archives the build on a `gh-pages` branch.

**Tech Stack:** Node ≥ 22.12, React 19, Vite 8, TypeScript ~6.0, Vitest 5, Playwright 1.63, oxlint, idb-keyval 6, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-29-morse-trainer-design.md`

### Plan series (this is Plan 1 of 6)

1. **Foundation** (this plan) — spec milestones 1–2 + speed/difficulty (§3.5.1) + scoring.
2. Impairments — noise, bandwidth, QSB, QRM, QRN, bad fist, presets, WAV export.
3. Content — words, sentences, callsigns, numbers, Q-codes, QSO/exam generators + data.
4. Progress — IndexedDB progress, stats, confusion matrix, Koch course, adaptive, exam simulator, head copy.
5. Sending — keying adapters (keyboard, mouse, MIDI, serial), iambic keyer, decoder, Send mode.
6. QSO simulator, PWA/offline, light theme, polish.

## Global Constraints

- Stack: React 19 + Vite 8 + TypeScript `~6.0.2` (must stay `< 6.1`), plain CSS, oxlint. No UI framework.
- Audio: Web Audio API, synthesized in real time; no audio files shipped.
- Storage: browser only, IndexedDB via `idb-keyval`. No backend.
- Character set: ITU A–Z, 0–9, `. , ? / = + -`, prosigns `<AR> <SK> <BT> <KN>`. English only.
- Speed range: character speed 5–60 WPM, integer steps; effective speed 5..charWpm; extra word gap 0–5.
- Timing: `unit = 1.2 / wpm` seconds (PARIS); Farnsworth per ARRL formula.
- Element envelope: 5 ms raised-cosine ramps.
- Routing: hash routes (`#/`, `#/receive`).
- Vite `base` comes from env `BASE_PATH`, default `/`.
- All randomness comes from the seeded PRNG `mulberry32`; `Math.random` only to create new seeds.
- Hotkeys: Enter/Space = play/next, R = repeat, Esc = stop, `+`/`-` = ±1 WPM outside text fields, PageUp/PageDown = ±1 WPM anywhere (Shift = ±5).
- Every commit ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Speed change while audio is playing** — the rest of the item must continue at the new speed with no audio exceptions and playback must still reach "Finished" (pinned: Task 8 `findRescheduleIndex` tests, Task 11 e2e "speed change mid-item").
2. **Pressing Play/Repeat rapidly** — previous playback must stop, only the newest item plays, the status must not flip to "Finished" because an old playback ended (pinned: Task 11 e2e "rapid replays").
3. **Corrupt, outdated, or partial stored settings, or storage unavailable (private mode)** — app must start with defaults / merged values, never crash (pinned: Task 6 `migrateSettings` tests, Task 7 store tests).
4. **Messy answers** — lowercase, extra/leading/trailing spaces must not count as errors (pinned: Task 5 scoring test "normalizes").
5. **Deployed under a sub-path** (`https://user.github.io/<repo>/`) — assets must load from `/<repo>/assets/` (pinned: Task 2 deploy workflow `grep` check and local build check).

---

## File Structure

```
package.json, vite.config.ts, tsconfig*.json, .oxlintrc.json, index.html, .gitignore, README.md
public/favicon.svg
playwright.config.ts
e2e/receive.spec.ts
.github/workflows/checks.yml     reusable: lint, typecheck, unit, e2e
.github/workflows/ci.yml         PRs + non-main pushes → checks
.github/workflows/deploy.yml     main → checks → build → Pages + gh-pages branch + artifact
src/main.tsx, src/App.tsx, src/index.css
src/morse/table.ts          char ↔ pattern map, tokenize()
src/morse/timing.ts         makeTiming() (PARIS + Farnsworth)
src/morse/encoder.ts        encodeTokens()/encode() → KeyEvent[]
src/content/rng.ts          mulberry32, randInt, pick, newSeed
src/content/generators/groups.ts   random character groups
src/training/scoring.ts     normalizeAnswer(), score() (Levenshtein alignment)
src/training/difficulty.ts  Level type, LEVELS profiles, getLevel()
src/training/itemSource.ts  makeItem(level, seed) → ExerciseItem
src/store/settings.ts       Settings type, defaults, clamping, level/speed setters, migrateSettings()
src/store/settingsStore.ts  loadSettings()/saveSettings() via idb-keyval
src/store/useSettings.ts    React hook
src/audio/envelope.ts       raisedCosine(), scheduleEnvelope()
src/audio/reschedule.ts     findRescheduleIndex()
src/audio/engine.ts         MorseEngine, PlaybackHandle, engine singleton
src/ui/useHashRoute.ts
src/ui/NumberField.tsx
src/ui/SpeedBar.tsx
src/ui/ScoreView.tsx
src/ui/pages/Home.tsx
src/ui/pages/Receive.tsx
```

Unit tests sit next to their module as `*.test.ts`.

---

### Task 1: Project scaffold and tooling

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `.oxlintrc.json`, `.gitignore`, `index.html`, `public/favicon.svg`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: npm scripts `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `test:watch` (later `test:e2e`); `vite.config.ts` reading `BASE_PATH`; Vitest picking up `src/**/*.test.ts` in the `node` environment.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "cw-trainer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=22.12" },
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "oxlint",
    "typecheck": "tsc -b",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install react@^19 react-dom@^19 idb-keyval@^6
npm install -D vite@^8 @vitejs/plugin-react@^6 typescript@~6.0.2 @types/react@^19 @types/react-dom@^19 @types/node@^24 oxlint@^1 vitest@^5
```
Expected: installs without peer-dependency errors; `package-lock.json` created.

- [ ] **Step 3: Create config files**

`vite.config.ts`:
```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// BASE_PATH is set by the deploy workflow to "/<repo-name>/" for GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
```

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "esnext",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "skipLibCheck": true,
    "module": "nodenext",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts"]
}
```

`.oxlintrc.json`:
```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "ignorePatterns": ["dist", "playwright-report", "test-results"],
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

`.gitignore`:
```
node_modules
dist
dist-ssr
*.local
*.log
playwright-report
test-results
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
```

- [ ] **Step 4: Create app entry files**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Morse code (CW) trainer for amateur radio: receive and send practice with realistic band conditions." />
    <title>CW Trainer — Morse code practice</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`public/favicon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0f172a"/><circle cx="9" cy="16" r="3" fill="#fbbf24"/><rect x="15" y="13" width="12" height="6" rx="3" fill="#fbbf24"/></svg>
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/App.tsx` (replaced in Task 9):
```tsx
export default function App() {
  return <h1>CW Trainer</h1>
}
```

`src/index.css`:
```css
:root {
  --bg: #0b1120;
  --surface: #111a2e;
  --surface-2: #1a2540;
  --border: #2a3656;
  --text: #e5e9f2;
  --muted: #94a3b8;
  --accent: #fbbf24;
  --accent-text: #0b1120;
  --ok: #4ade80;
  --bad: #f87171;
  --warn: #fb923c;
  color-scheme: dark;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.5;
  background: var(--bg);
  color: var(--text);
}

* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; }
a { color: var(--accent); }
code, .mono { font-family: ui-monospace, 'JetBrains Mono', Menlo, monospace; }

button, input, select {
  font: inherit;
  color: inherit;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.4rem 0.7rem;
}
button { cursor: pointer; }
button:disabled, input:disabled, select:disabled { opacity: 0.5; cursor: not-allowed; }
button.primary { background: var(--accent); color: var(--accent-text); border-color: var(--accent); font-weight: 600; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

`README.md`:
````markdown
# CW Trainer

Morse code (CW) practice for amateur radio — receive and send training with
realistic band conditions. Runs entirely in the browser.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run test:e2e   # browser tests (first: npx playwright install chromium)
npm run lint && npm run typecheck
```

## Deploy (GitHub Pages)

1. Push this repo to GitHub.
2. Repository → Settings → Pages → Source: **GitHub Actions**.
3. Every push to `main` runs the checks, deploys the site to
   `https://<user>.github.io/<repo>/`, pushes the built site to the `gh-pages`
   branch, and attaches `dist` as a downloadable workflow artifact.

Design: `docs/superpowers/specs/2026-09-29-morse-trainer-design.md`.
````

- [ ] **Step 5: Verify tooling**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: oxlint reports 0 errors; `tsc -b` silent; Vitest "No test files found, exiting with code 0"; Vite build writes `dist/index.html`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TypeScript project

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: CI/CD workflows for GitHub Pages

**Files:**
- Create: `.github/workflows/checks.yml`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: npm scripts from Task 1.
- Produces: reusable workflow `checks.yml` (Task 11 appends the e2e steps to it).

- [ ] **Step 1: Create `.github/workflows/checks.yml`**

```yaml
name: Checks

on:
  workflow_call:

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches-ignore: [main, gh-pages]

jobs:
  checks:
    uses: ./.github/workflows/checks.yml
```

- [ ] **Step 3: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  checks:
    uses: ./.github/workflows/checks.yml

  build:
    needs: checks
    runs-on: ubuntu-latest
    env:
      BASE_PATH: /${{ github.event.repository.name }}/
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Verify assets use the Pages base path
        run: grep -q "src=\"${BASE_PATH}assets/" dist/index.html
      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v5
        with:
          path: dist
      - name: Upload build as downloadable artifact
        uses: actions/upload-artifact@v7
        with:
          name: dist
          path: dist
      - name: Publish build to gh-pages branch
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
          publish_branch: gh-pages
          commit_message: "build: ${{ github.sha }}"

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

- [ ] **Step 4: Validate YAML and the base-path check locally**

Run:
```bash
npx --yes yaml-lint .github/workflows/*.yml
BASE_PATH=/radio-amatur/ npm run build && grep -q 'src="/radio-amatur/assets/' dist/index.html && echo BASE_OK
npm run build
```
Expected: yaml-lint reports the files valid, `BASE_OK` printed. (The final plain build restores a root-based `dist/`.)

- [ ] **Step 5: Commit**

```bash
git add .github
git commit -m "ci: add checks, CI and GitHub Pages deploy workflows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Morse core — table, timing, encoder

**Files:**
- Create: `src/morse/table.ts`, `src/morse/timing.ts`, `src/morse/encoder.ts`
- Test: `src/morse/table.test.ts`, `src/morse/timing.test.ts`, `src/morse/encoder.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MORSE: Readonly<Record<string, string>>`, `LETTERS: string`, `DIGITS: string`, `PUNCTUATION: string`, `PROSIGNS: readonly string[]`
  - `tokenize(text: string): string[]` — char tokens (`'A'`, `'<AR>'`) and `' '` word separators
  - `interface TimingInput { charWpm: number; effWpm: number; extraWordGap: number }`
  - `interface Timing { dit: number; dah: number; elementGap: number; charGap: number; wordGap: number }` (seconds)
  - `unitSeconds(wpm: number): number`, `makeTiming(input: TimingInput): Timing`
  - `interface KeyEvent { down: boolean; t: number; i: number }` (`i` = token index)
  - `interface Encoded { events: KeyEvent[]; duration: number }`
  - `encodeTokens(tokens: readonly string[], timing: Timing): Encoded`
  - `encode(text: string, timing: Timing): Encoded & { tokens: string[] }`

- [ ] **Step 1: Write failing table tests** — `src/morse/table.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { DIGITS, LETTERS, MORSE, PROSIGNS, PUNCTUATION, tokenize } from './table'

describe('MORSE table', () => {
  it('covers every letter, digit, punctuation mark and prosign', () => {
    for (const c of [...LETTERS, ...DIGITS, ...PUNCTUATION, ...PROSIGNS]) {
      expect(MORSE[c], c).toMatch(/^[.-]+$/)
    }
  })

  it('has well-known codes', () => {
    expect(MORSE.A).toBe('.-')
    expect(MORSE.Q).toBe('--.-')
    expect(MORSE['0']).toBe('-----')
    expect(MORSE['?']).toBe('..--..')
    expect(MORSE['<SK>']).toBe('...-.-')
  })
})

describe('tokenize', () => {
  it('uppercases and splits into char and word tokens', () => {
    expect(tokenize('cq  de <AR>')).toEqual(['C', 'Q', ' ', 'D', 'E', ' ', '<AR>'])
  })

  it('drops unknown characters and trims spaces', () => {
    expect(tokenize(' a%b ')).toEqual(['A', 'B'])
  })

  it('treats an unknown <...> sequence as plain characters', () => {
    expect(tokenize('<ZZ>')).toEqual(['Z', 'Z'])
  })

  it('returns nothing for empty or all-unknown input', () => {
    expect(tokenize('')).toEqual([])
    expect(tokenize('  #%  ')).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/morse/table.test.ts`
Expected: FAIL — cannot resolve `./table`.

- [ ] **Step 3: Implement `src/morse/table.ts`**

```ts
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const DIGITS = '0123456789'
export const PUNCTUATION = '.,?/=+-'
export const PROSIGNS: readonly string[] = ['<AR>', '<SK>', '<BT>', '<KN>']

export const MORSE: Readonly<Record<string, string>> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.',
  H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.',
  O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-',
  V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '=': '-...-',
  '+': '.-.-.', '-': '-....-',
  '<AR>': '.-.-.', '<SK>': '...-.-', '<BT>': '-...-', '<KN>': '-.--.',
}

/** Splits text into Morse tokens: single characters, prosigns like `<AR>`, and `' '` word separators. */
export function tokenize(text: string): string[] {
  const upper = text.toUpperCase()
  const tokens: string[] = []
  for (let k = 0; k < upper.length; k++) {
    const c = upper[k]
    if (/\s/.test(c)) {
      if (tokens.length > 0 && tokens[tokens.length - 1] !== ' ') tokens.push(' ')
      continue
    }
    if (c === '<') {
      const close = upper.indexOf('>', k)
      const prosign = close > k ? upper.slice(k, close + 1) : ''
      if (MORSE[prosign]) {
        tokens.push(prosign)
        k = close
        continue
      }
    }
    if (MORSE[c]) tokens.push(c)
  }
  if (tokens[tokens.length - 1] === ' ') tokens.pop()
  return tokens
}
```

- [ ] **Step 4: Run table tests**

Run: `npx vitest run src/morse/table.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write failing timing tests** — `src/morse/timing.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { makeTiming, unitSeconds } from './timing'

describe('timing', () => {
  it('uses the PARIS unit: 20 WPM → 60 ms', () => {
    expect(unitSeconds(20)).toBeCloseTo(0.06, 10)
  })

  it('uses standard spacing when effective speed equals character speed', () => {
    const t = makeTiming({ charWpm: 20, effWpm: 20, extraWordGap: 0 })
    expect(t.dit).toBeCloseTo(0.06)
    expect(t.dah).toBeCloseTo(0.18)
    expect(t.elementGap).toBeCloseTo(0.06)
    expect(t.charGap).toBeCloseTo(0.18)
    expect(t.wordGap).toBeCloseTo(0.42)
  })

  it('stretches gaps with the ARRL Farnsworth formula', () => {
    const t = makeTiming({ charWpm: 18, effWpm: 5, extraWordGap: 0 })
    const ta = (60 * 18 - 37.2 * 5) / (5 * 18)
    expect(t.dit).toBeCloseTo(1.2 / 18)
    expect(t.charGap).toBeCloseTo((3 * ta) / 19)
    expect(t.wordGap).toBeCloseTo((7 * ta) / 19)
  })

  it('treats an effective speed above character speed as equal', () => {
    const t = makeTiming({ charWpm: 20, effWpm: 30, extraWordGap: 0 })
    expect(t.charGap).toBeCloseTo(0.18)
  })

  it('adds extra word gap as a multiple of the word gap', () => {
    const t = makeTiming({ charWpm: 20, effWpm: 20, extraWordGap: 1 })
    expect(t.wordGap).toBeCloseTo(0.84)
  })
})
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run src/morse/timing.test.ts`
Expected: FAIL — cannot resolve `./timing`.

- [ ] **Step 7: Implement `src/morse/timing.ts`**

```ts
export interface TimingInput {
  charWpm: number
  effWpm: number
  /** Additional word gap as a multiple of the normal word gap (0 = none). */
  extraWordGap: number
}

/** Durations in seconds. */
export interface Timing {
  dit: number
  dah: number
  elementGap: number
  charGap: number
  wordGap: number
}

/** Length of one Morse unit at the given speed, using the 50-unit word "PARIS ". */
export function unitSeconds(wpm: number): number {
  return 1.2 / wpm
}

export function makeTiming({ charWpm, effWpm, extraWordGap }: TimingInput): Timing {
  const u = unitSeconds(charWpm)
  const eff = Math.min(effWpm, charWpm)
  let charGap = 3 * u
  let wordGap = 7 * u
  if (eff < charWpm) {
    // ARRL Farnsworth: total extra delay per word, split 3:7 between char and word gaps.
    const ta = (60 * charWpm - 37.2 * eff) / (eff * charWpm)
    charGap = (3 * ta) / 19
    wordGap = (7 * ta) / 19
  }
  return { dit: u, dah: 3 * u, elementGap: u, charGap, wordGap: wordGap * (1 + extraWordGap) }
}
```

- [ ] **Step 8: Run timing tests**

Run: `npx vitest run src/morse/timing.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Write failing encoder tests** — `src/morse/encoder.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { encode, encodeTokens } from './encoder'
import { makeTiming } from './timing'

const t20 = makeTiming({ charWpm: 20, effWpm: 20, extraWordGap: 0 })
const U = 0.06

describe('encode', () => {
  it('encodes E as one dit', () => {
    const r = encode('E', t20)
    expect(r.events).toEqual([
      { down: true, t: 0, i: 0 },
      { down: false, t: expect.closeTo(U, 9), i: 0 },
    ])
    expect(r.duration).toBeCloseTo(U)
  })

  it('makes PARIS 43 units of sound+gaps and PARIS+space exactly 50 units', () => {
    const r = encode('PARIS PARIS', t20)
    const firstWordEnd = r.events.filter((e) => e.i <= 4).at(-1)!
    expect(firstWordEnd.t).toBeCloseTo(43 * U)
    const secondP = r.events.find((e) => e.i === 6)!
    expect(secondP.down).toBe(true)
    expect(secondP.t).toBeCloseTo(50 * U)
  })

  it('hits the effective speed exactly with Farnsworth timing', () => {
    const t = makeTiming({ charWpm: 18, effWpm: 5, extraWordGap: 0 })
    const secondP = encode('PARIS PARIS', t).events.find((e) => e.i === 6)!
    expect(secondP.t).toBeCloseTo(60 / 5)
  })

  it('alternates down/up events and tags every event with its token index', () => {
    const r = encode('AB', t20)
    expect(r.events.map((e) => e.down)).toEqual([true, false, true, false, true, false, true, false, true, false, true, false])
    expect(r.events.map((e) => e.i)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1])
  })

  it('returns no events for empty text', () => {
    expect(encode('', t20)).toEqual({ tokens: [], events: [], duration: 0 })
  })
})

describe('encodeTokens', () => {
  it('ignores leading word separators', () => {
    const r = encodeTokens([' ', 'E'], t20)
    expect(r.events[0]).toEqual({ down: true, t: 0, i: 1 })
  })
})
```

- [ ] **Step 10: Run to verify failure**

Run: `npx vitest run src/morse/encoder.test.ts`
Expected: FAIL — cannot resolve `./encoder`.

- [ ] **Step 11: Implement `src/morse/encoder.ts`**

```ts
import { MORSE, tokenize } from './table'
import type { Timing } from './timing'

export interface KeyEvent {
  down: boolean
  /** Seconds from the start of the transmission. */
  t: number
  /** Index of the token this event belongs to. */
  i: number
}

export interface Encoded {
  events: KeyEvent[]
  /** Time of the last key-up, in seconds. */
  duration: number
}

export function encodeTokens(tokens: readonly string[], timing: Timing): Encoded {
  const events: KeyEvent[] = []
  let t = 0
  let prev: 'none' | 'char' | 'word' = 'none'
  tokens.forEach((token, i) => {
    if (token === ' ') {
      if (prev === 'char') prev = 'word'
      return
    }
    const pattern = MORSE[token]
    if (!pattern) return
    if (prev === 'char') t += timing.charGap
    else if (prev === 'word') t += timing.wordGap
    for (let k = 0; k < pattern.length; k++) {
      if (k > 0) t += timing.elementGap
      events.push({ down: true, t, i })
      t += pattern[k] === '.' ? timing.dit : timing.dah
      events.push({ down: false, t, i })
    }
    prev = 'char'
  })
  return { events, duration: t }
}

export function encode(text: string, timing: Timing): Encoded & { tokens: string[] } {
  const tokens = tokenize(text)
  return { tokens, ...encodeTokens(tokens, timing) }
}
```

- [ ] **Step 12: Run all morse tests**

Run: `npx vitest run src/morse`
Expected: PASS (17 tests: table 6, timing 5, encoder 6).

- [ ] **Step 13: Commit**

```bash
git add src/morse
git commit -m "feat(morse): character table, PARIS/Farnsworth timing, encoder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Seeded RNG and character-group generator

**Files:**
- Create: `src/content/rng.ts`, `src/content/generators/groups.ts`
- Test: `src/content/rng.test.ts`, `src/content/generators/groups.test.ts`

**Interfaces:**
- Consumes: `MORSE`, `LETTERS`, `DIGITS` from `src/morse/table.ts`.
- Produces:
  - `type Rng = () => number` (uniform in [0, 1))
  - `mulberry32(seed: number): Rng`, `randInt(rng: Rng, min: number, max: number): number` (inclusive), `pick<T>(rng: Rng, items: readonly T[]): T`, `newSeed(): number`
  - `interface GroupOptions { charset: string; minLen: number; maxLen: number; count: number }`
  - `generateGroups(rng: Rng, options: GroupOptions): string` — groups joined by single spaces

- [ ] **Step 1: Write failing tests**

`src/content/rng.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mulberry32, newSeed, pick, randInt } from './rng'

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const xs = Array.from({ length: 5 }, () => a())
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs)
  })

  it('differs between seeds and stays in [0, 1)', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    expect(a()).not.toEqual(b())
    const r = mulberry32(7)
    for (let k = 0; k < 10_000; k++) {
      const x = r()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  it('randInt covers the inclusive range', () => {
    const r = mulberry32(3)
    const seen = new Set<number>()
    for (let k = 0; k < 1000; k++) seen.add(randInt(r, 2, 5))
    expect([...seen].sort()).toEqual([2, 3, 4, 5])
  })

  it('pick returns items from the list', () => {
    const r = mulberry32(9)
    for (let k = 0; k < 100; k++) expect(['a', 'b', 'c']).toContain(pick(r, ['a', 'b', 'c']))
  })

  it('newSeed returns a 32-bit unsigned integer', () => {
    const s = newSeed()
    expect(Number.isInteger(s)).toBe(true)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThan(2 ** 32)
  })
})
```

`src/content/generators/groups.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../rng'
import { generateGroups } from './groups'

const opts = { charset: 'KMRSU', minLen: 2, maxLen: 4, count: 6 }

describe('generateGroups', () => {
  it('is deterministic for a seed', () => {
    expect(generateGroups(mulberry32(5), opts)).toBe(generateGroups(mulberry32(5), opts))
  })

  it('produces count groups within the length range using only the charset', () => {
    const text = generateGroups(mulberry32(11), opts)
    const groups = text.split(' ')
    expect(groups).toHaveLength(6)
    for (const g of groups) {
      expect(g.length).toBeGreaterThanOrEqual(2)
      expect(g.length).toBeLessThanOrEqual(4)
      expect(g).toMatch(/^[KMRSU]+$/)
    }
  })

  it('rejects invalid options', () => {
    const r = mulberry32(1)
    expect(() => generateGroups(r, { ...opts, charset: '' })).toThrow(/charset/)
    expect(() => generateGroups(r, { ...opts, charset: 'A#' })).toThrow(/charset/)
    expect(() => generateGroups(r, { ...opts, minLen: 5, maxLen: 2 })).toThrow(/length/)
    expect(() => generateGroups(r, { ...opts, count: 0 })).toThrow(/count/)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/content`
Expected: FAIL — cannot resolve `./rng` / `./groups`.

- [ ] **Step 3: Implement `src/content/rng.ts`**

```ts
/** Uniform random number in [0, 1). */
export type Rng = () => number

/** Small, fast, seedable PRNG. Same seed → same sequence, so exercises can be replayed exactly. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]
}

/** The only place Math.random is allowed: choosing a fresh seed. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 32)
}
```

- [ ] **Step 4: Implement `src/content/generators/groups.ts`**

```ts
import { MORSE } from '../../morse/table'
import { randInt, type Rng } from '../rng'

export interface GroupOptions {
  charset: string
  minLen: number
  maxLen: number
  count: number
}

export function generateGroups(rng: Rng, { charset, minLen, maxLen, count }: GroupOptions): string {
  const chars = [...charset]
  if (chars.length === 0 || chars.some((c) => !MORSE[c])) {
    throw new Error(`Invalid charset "${charset}": must be non-empty Morse characters`)
  }
  if (minLen < 1 || minLen > maxLen) throw new Error(`Invalid group length ${minLen}..${maxLen}`)
  if (count < 1) throw new Error(`Invalid group count ${count}`)

  const groups: string[] = []
  for (let g = 0; g < count; g++) {
    const len = randInt(rng, minLen, maxLen)
    let group = ''
    for (let k = 0; k < len; k++) group += chars[Math.floor(rng() * chars.length)]
    groups.push(group)
  }
  return groups.join(' ')
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/content`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/content
git commit -m "feat(content): seeded PRNG and character-group generator

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Answer scoring

**Files:**
- Create: `src/training/scoring.ts`
- Test: `src/training/scoring.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Op = { kind: 'match'; char: string } | { kind: 'sub'; expected: string; typed: string } | { kind: 'missing'; expected: string } | { kind: 'extra'; typed: string }`
  - `interface ScoreResult { ops: Op[]; correct: number; total: number; accuracy: number }`
  - `normalizeAnswer(s: string): string`
  - `score(expected: string, typed: string): ScoreResult` — `total = expected length + extras`, `accuracy = correct / total` (1 when both empty)

- [ ] **Step 1: Write failing tests** — `src/training/scoring.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { normalizeAnswer, score } from './scoring'

describe('score', () => {
  it('perfect copy', () => {
    const r = score('ABC', 'ABC')
    expect(r.accuracy).toBe(1)
    expect(r.ops).toEqual([
      { kind: 'match', char: 'A' },
      { kind: 'match', char: 'B' },
      { kind: 'match', char: 'C' },
    ])
  })

  it('substitution', () => {
    const r = score('ABC', 'AXC')
    expect(r.ops[1]).toEqual({ kind: 'sub', expected: 'B', typed: 'X' })
    expect(r.correct).toBe(2)
    expect(r.total).toBe(3)
  })

  it('missing character', () => {
    const r = score('ABC', 'AC')
    expect(r.ops).toEqual([
      { kind: 'match', char: 'A' },
      { kind: 'missing', expected: 'B' },
      { kind: 'match', char: 'C' },
    ])
    expect(r.accuracy).toBeCloseTo(2 / 3)
  })

  it('extra character counts against accuracy', () => {
    const r = score('ABC', 'ABXC')
    expect(r.ops[2]).toEqual({ kind: 'extra', typed: 'X' })
    expect(r.total).toBe(4)
    expect(r.accuracy).toBeCloseTo(3 / 4)
  })

  it('normalizes case and whitespace', () => {
    expect(score('CQ DE', '  cq   de ').accuracy).toBe(1)
  })

  it('handles empty inputs', () => {
    expect(score('', '').accuracy).toBe(1)
    expect(score('AB', '').accuracy).toBe(0)
    expect(score('', 'AB').accuracy).toBe(0)
  })
})

describe('normalizeAnswer', () => {
  it('uppercases, collapses and trims whitespace', () => {
    expect(normalizeAnswer(' a\t b  c ')).toBe('A B C')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/training/scoring.test.ts`
Expected: FAIL — cannot resolve `./scoring`.

- [ ] **Step 3: Implement `src/training/scoring.ts`**

```ts
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
  return s.toUpperCase().replace(/\s+/g, ' ').trim()
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/training/scoring.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/training/scoring.ts src/training/scoring.test.ts
git commit -m "feat(training): Levenshtein answer scoring

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Difficulty levels, settings model, item source

**Files:**
- Create: `src/training/difficulty.ts`, `src/store/settings.ts`, `src/training/itemSource.ts`
- Test: `src/training/difficulty.test.ts`, `src/store/settings.test.ts`, `src/training/itemSource.test.ts`

**Interfaces:**
- Consumes: `mulberry32` (Task 4), `generateGroups`, `GroupOptions` (Task 4), `LETTERS`, `DIGITS` (Task 3).
- Produces:
  - `type Level = 1 | 2 | 3 | 4 | 5 | 6`
  - `type ContentKind = 'chars' | 'short-words' | 'words-callsigns' | 'sentences-qso' | 'callsigns-serials'`
  - `type ConditionsPreset = 'clean' | 'light-noise' | 'moderate' | 'poor' | 'contest'`
  - `interface DifficultyProfile { level: Level; name: string; charWpm: number; effWpm: number; content: ContentKind; conditions: ConditionsPreset }`
  - `LEVELS: readonly DifficultyProfile[]`, `getLevel(level: Level): DifficultyProfile`
  - `interface Settings { schemaVersion: 1; level: Level | 'custom'; charWpm: number; effWpm: number; linkSpeeds: boolean; extraWordGap: number; pitchHz: number; volume: number }`
  - `SPEED_MIN = 5`, `SPEED_MAX = 60`, `DEFAULT_SETTINGS: Settings`
  - `normalizeSettings(s: Settings): Settings`, `migrateSettings(raw: unknown): Settings`
  - `applyLevel(s: Settings, level: Level): Settings`, `setCharWpm(s: Settings, wpm: number): Settings`, `setEffWpm(s: Settings, wpm: number): Settings`, `setLinkSpeeds(s: Settings, linked: boolean): Settings`, `nudgeSpeed(s: Settings, delta: number): Settings`
  - `interface ExerciseItem { text: string; kind: 'groups'; seed: number }`
  - `groupOptionsFor(kind: ContentKind): GroupOptions`, `makeItem(level: Settings['level'], seed: number): ExerciseItem`

- [ ] **Step 1: Write failing difficulty tests** — `src/training/difficulty.test.ts`

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/training/difficulty.test.ts`
Expected: FAIL — cannot resolve `./difficulty`.

- [ ] **Step 3: Implement `src/training/difficulty.ts`**

```ts
export type Level = 1 | 2 | 3 | 4 | 5 | 6

export type ContentKind = 'chars' | 'short-words' | 'words-callsigns' | 'sentences-qso' | 'callsigns-serials'

/** Band-condition preset names; the impairment parameters behind them arrive in Plan 2. */
export type ConditionsPreset = 'clean' | 'light-noise' | 'moderate' | 'poor' | 'contest'

export interface DifficultyProfile {
  level: Level
  name: string
  charWpm: number
  effWpm: number
  content: ContentKind
  conditions: ConditionsPreset
}

export const LEVELS: readonly DifficultyProfile[] = [
  { level: 1, name: 'Novice', charWpm: 18, effWpm: 5, content: 'chars', conditions: 'clean' },
  { level: 2, name: 'Beginner', charWpm: 20, effWpm: 10, content: 'short-words', conditions: 'clean' },
  { level: 3, name: 'Intermediate', charWpm: 20, effWpm: 15, content: 'words-callsigns', conditions: 'light-noise' },
  { level: 4, name: 'Advanced', charWpm: 25, effWpm: 25, content: 'sentences-qso', conditions: 'moderate' },
  { level: 5, name: 'Expert', charWpm: 30, effWpm: 30, content: 'sentences-qso', conditions: 'poor' },
  { level: 6, name: 'Contest', charWpm: 35, effWpm: 35, content: 'callsigns-serials', conditions: 'contest' },
]

export function getLevel(level: Level): DifficultyProfile {
  return LEVELS[level - 1]
}
```

- [ ] **Step 4: Write failing settings tests** — `src/store/settings.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  applyLevel,
  DEFAULT_SETTINGS,
  migrateSettings,
  nudgeSpeed,
  setCharWpm,
  setEffWpm,
  setLinkSpeeds,
} from './settings'

describe('migrateSettings', () => {
  it('returns defaults for missing, junk or unknown-version data', () => {
    expect(migrateSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(migrateSettings('junk')).toEqual(DEFAULT_SETTINGS)
    expect(migrateSettings({ schemaVersion: 99, charWpm: 30 })).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid fields and replaces invalid ones with defaults', () => {
    const s = migrateSettings({ schemaVersion: 1, charWpm: 'fast', effWpm: 12, level: 9, pitchHz: 700 })
    expect(s.charWpm).toBe(DEFAULT_SETTINGS.charWpm)
    expect(s.effWpm).toBe(12)
    expect(s.level).toBe(DEFAULT_SETTINGS.level)
    expect(s.pitchHz).toBe(700)
  })

  it('clamps out-of-range values', () => {
    const s = migrateSettings({ schemaVersion: 1, charWpm: 500, effWpm: 400, pitchHz: 5, volume: 3, extraWordGap: -1 })
    expect(s.charWpm).toBe(60)
    expect(s.effWpm).toBe(60)
    expect(s.pitchHz).toBe(400)
    expect(s.volume).toBe(1)
    expect(s.extraWordGap).toBe(0)
  })
})

describe('speed setters', () => {
  it('applyLevel copies the profile speeds and links equal speeds', () => {
    expect(applyLevel(DEFAULT_SETTINGS, 1)).toMatchObject({ level: 1, charWpm: 18, effWpm: 5, linkSpeeds: false })
    expect(applyLevel(DEFAULT_SETTINGS, 4)).toMatchObject({ level: 4, charWpm: 25, effWpm: 25, linkSpeeds: true })
  })

  it('setCharWpm switches to custom and keeps effective ≤ character speed', () => {
    const s = setCharWpm({ ...DEFAULT_SETTINGS, charWpm: 20, effWpm: 15, linkSpeeds: false }, 12)
    expect(s).toMatchObject({ level: 'custom', charWpm: 12, effWpm: 12 })
  })

  it('setCharWpm drags effective speed along when linked', () => {
    const s = setCharWpm({ ...DEFAULT_SETTINGS, charWpm: 20, effWpm: 20, linkSpeeds: true }, 30)
    expect(s).toMatchObject({ charWpm: 30, effWpm: 30 })
  })

  it('setCharWpm rounds and clamps', () => {
    expect(setCharWpm(DEFAULT_SETTINGS, 99).charWpm).toBe(60)
    expect(setCharWpm(DEFAULT_SETTINGS, 2).charWpm).toBe(5)
    expect(setCharWpm(DEFAULT_SETTINGS, 22.6).charWpm).toBe(23)
  })

  it('setEffWpm cannot exceed character speed', () => {
    const s = setEffWpm({ ...DEFAULT_SETTINGS, charWpm: 20, effWpm: 10, linkSpeeds: false }, 25)
    expect(s).toMatchObject({ level: 'custom', effWpm: 20 })
  })

  it('setLinkSpeeds(true) sets effective = character speed', () => {
    const s = setLinkSpeeds({ ...DEFAULT_SETTINGS, charWpm: 20, effWpm: 10, linkSpeeds: false }, true)
    expect(s).toMatchObject({ linkSpeeds: true, effWpm: 20 })
  })

  it('nudgeSpeed moves both speeds and clamps at the limits', () => {
    const base = { ...DEFAULT_SETTINGS, charWpm: 20, effWpm: 10, linkSpeeds: false }
    expect(nudgeSpeed(base, 1)).toMatchObject({ level: 'custom', charWpm: 21, effWpm: 11 })
    expect(nudgeSpeed({ ...base, charWpm: 60, effWpm: 60 }, 5)).toMatchObject({ charWpm: 60, effWpm: 60 })
    expect(nudgeSpeed({ ...base, charWpm: 5, effWpm: 5 }, -1)).toMatchObject({ charWpm: 5, effWpm: 5 })
  })
})
```

- [ ] **Step 5: Run to verify failure**

Run: `npx vitest run src/store/settings.test.ts`
Expected: FAIL — cannot resolve `./settings`.

- [ ] **Step 6: Implement `src/store/settings.ts`**

```ts
import { getLevel, LEVELS, type Level } from '../training/difficulty'

export interface Settings {
  schemaVersion: 1
  level: Level | 'custom'
  charWpm: number
  effWpm: number
  /** When true, effective speed always equals character speed. */
  linkSpeeds: boolean
  extraWordGap: number
  pitchHz: number
  volume: number
}

export const SPEED_MIN = 5
export const SPEED_MAX = 60

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  level: 2,
  charWpm: 20,
  effWpm: 10,
  linkSpeeds: false,
  extraWordGap: 0,
  pitchHz: 600,
  volume: 0.5,
}

const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x))

export function normalizeSettings(s: Settings): Settings {
  const charWpm = clamp(Math.round(s.charWpm), SPEED_MIN, SPEED_MAX)
  const effWpm = s.linkSpeeds ? charWpm : clamp(Math.round(s.effWpm), SPEED_MIN, charWpm)
  return {
    ...s,
    charWpm,
    effWpm,
    extraWordGap: clamp(s.extraWordGap, 0, 5),
    pitchHz: clamp(Math.round(s.pitchHz), 400, 1000),
    volume: clamp(s.volume, 0, 1),
  }
}

/** Turns whatever was stored (possibly nothing, junk, or an old version) into valid Settings. */
export function migrateSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS
  const r = raw as Record<string, unknown>
  if (r.schemaVersion !== 1) return DEFAULT_SETTINGS
  const num = (key: keyof Settings) => {
    const v = r[key]
    return typeof v === 'number' && Number.isFinite(v) ? v : (DEFAULT_SETTINGS[key] as number)
  }
  const validLevel = r.level === 'custom' || LEVELS.some((l) => l.level === r.level)
  return normalizeSettings({
    schemaVersion: 1,
    level: validLevel ? (r.level as Settings['level']) : DEFAULT_SETTINGS.level,
    charWpm: num('charWpm'),
    effWpm: num('effWpm'),
    linkSpeeds: typeof r.linkSpeeds === 'boolean' ? r.linkSpeeds : DEFAULT_SETTINGS.linkSpeeds,
    extraWordGap: num('extraWordGap'),
    pitchHz: num('pitchHz'),
    volume: num('volume'),
  })
}

export function applyLevel(s: Settings, level: Level): Settings {
  const p = getLevel(level)
  return normalizeSettings({ ...s, level, charWpm: p.charWpm, effWpm: p.effWpm, linkSpeeds: p.charWpm === p.effWpm })
}

export function setCharWpm(s: Settings, wpm: number): Settings {
  return normalizeSettings({ ...s, level: 'custom', charWpm: wpm })
}

export function setEffWpm(s: Settings, wpm: number): Settings {
  return normalizeSettings({ ...s, level: 'custom', effWpm: wpm })
}

export function setLinkSpeeds(s: Settings, linked: boolean): Settings {
  return normalizeSettings({ ...s, linkSpeeds: linked })
}

export function nudgeSpeed(s: Settings, delta: number): Settings {
  const charWpm = clamp(s.charWpm + delta, SPEED_MIN, SPEED_MAX)
  return normalizeSettings({ ...s, level: 'custom', charWpm, effWpm: s.effWpm + delta })
}
```

- [ ] **Step 7: Write failing item-source tests** — `src/training/itemSource.test.ts`

```ts
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
```

- [ ] **Step 8: Implement `src/training/itemSource.ts`**

```ts
import { generateGroups, type GroupOptions } from '../content/generators/groups'
import { mulberry32 } from '../content/rng'
import { DIGITS, LETTERS } from '../morse/table'
import type { Settings } from '../store/settings'
import { getLevel, type ContentKind } from './difficulty'

export interface ExerciseItem {
  text: string
  kind: 'groups'
  seed: number
}

const CHARSET = LETTERS + DIGITS

// Only character groups exist so far; the content plan replaces this mapping with
// word, callsign, sentence and QSO generators per ContentKind.
export function groupOptionsFor(kind: ContentKind): GroupOptions {
  return kind === 'chars'
    ? { charset: CHARSET, minLen: 1, maxLen: 3, count: 3 }
    : { charset: CHARSET, minLen: 5, maxLen: 5, count: 5 }
}

export function makeItem(level: Settings['level'], seed: number): ExerciseItem {
  const kind: ContentKind = level === 'custom' ? 'words-callsigns' : getLevel(level).content
  return { text: generateGroups(mulberry32(seed), groupOptionsFor(kind)), kind: 'groups', seed }
}
```

- [ ] **Step 9: Run tests**

Run: `npx vitest run src/training src/store`
Expected: PASS (difficulty 3, settings 10, itemSource 3, scoring 7).

- [ ] **Step 10: Commit**

```bash
git add src/training src/store
git commit -m "feat: difficulty levels, settings model and exercise item source

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Settings persistence

**Files:**
- Create: `src/store/settingsStore.ts`, `src/store/useSettings.ts`
- Test: `src/store/settingsStore.test.ts`

**Interfaces:**
- Consumes: `Settings`, `DEFAULT_SETTINGS`, `migrateSettings` (Task 6); `get`, `set` from `idb-keyval`.
- Produces:
  - `SETTINGS_KEY = 'settings'`
  - `loadSettings(): Promise<Settings>` — never rejects
  - `saveSettings(s: Settings): Promise<void>` — never rejects
  - `type UpdateSettings = (fn: (s: Settings) => Settings) => void`
  - `useSettings(): { settings: Settings; update: UpdateSettings; loaded: boolean }`

- [ ] **Step 1: Write failing tests** — `src/store/settingsStore.test.ts`

```ts
import { get, set } from 'idb-keyval'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from './settings'
import { loadSettings, saveSettings, SETTINGS_KEY } from './settingsStore'

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn() }))

beforeEach(() => {
  vi.mocked(get).mockReset()
  vi.mocked(set).mockReset()
})

describe('settingsStore', () => {
  it('loads and migrates stored settings', async () => {
    vi.mocked(get).mockResolvedValue({ ...DEFAULT_SETTINGS, charWpm: 33 })
    expect((await loadSettings()).charWpm).toBe(33)
    expect(get).toHaveBeenCalledWith(SETTINGS_KEY)
  })

  it('falls back to defaults when nothing is stored', async () => {
    vi.mocked(get).mockResolvedValue(undefined)
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to defaults when storage is unavailable', async () => {
    vi.mocked(get).mockRejectedValue(new Error('IndexedDB blocked'))
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('saves, and swallows storage errors', async () => {
    vi.mocked(set).mockResolvedValue(undefined)
    await saveSettings(DEFAULT_SETTINGS)
    expect(set).toHaveBeenCalledWith(SETTINGS_KEY, DEFAULT_SETTINGS)
    vi.mocked(set).mockRejectedValue(new Error('quota'))
    await expect(saveSettings(DEFAULT_SETTINGS)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/store/settingsStore.test.ts`
Expected: FAIL — cannot resolve `./settingsStore`.

- [ ] **Step 3: Implement `src/store/settingsStore.ts`**

```ts
import { get, set } from 'idb-keyval'
import { DEFAULT_SETTINGS, migrateSettings, type Settings } from './settings'

export const SETTINGS_KEY = 'settings'

export async function loadSettings(): Promise<Settings> {
  try {
    return migrateSettings(await get(SETTINGS_KEY))
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  try {
    await set(SETTINGS_KEY, s)
  } catch {
    // Storage unavailable (e.g. private browsing): settings live in memory for this session.
  }
}
```

- [ ] **Step 4: Implement `src/store/useSettings.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type Settings } from './settings'
import { loadSettings, saveSettings } from './settingsStore'

export type UpdateSettings = (fn: (s: Settings) => Settings) => void

export function useSettings(): { settings: Settings; update: UpdateSettings; loaded: boolean } {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    void loadSettings().then((s) => {
      if (!alive) return
      setSettings(s)
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (loaded) void saveSettings(settings)
  }, [settings, loaded])

  const update = useCallback<UpdateSettings>((fn) => setSettings(fn), [])
  return { settings, update, loaded }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/store && npm run typecheck`
Expected: PASS (settings 10, settingsStore 4); typecheck silent.

- [ ] **Step 6: Commit**

```bash
git add src/store
git commit -m "feat(store): persist settings in IndexedDB with safe fallbacks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Audio engine (clean keyer with live speed change)

**Files:**
- Create: `src/audio/envelope.ts`, `src/audio/reschedule.ts`, `src/audio/engine.ts`
- Test: `src/audio/envelope.test.ts`, `src/audio/reschedule.test.ts`

**Interfaces:**
- Consumes: `KeyEvent`, `encodeTokens` (Task 3), `tokenize` (Task 3), `Timing` (Task 3).
- Produces:
  - `RAMP_SECONDS = 0.005`, `raisedCosine(samples: number, rising: boolean): Float32Array`
  - `scheduleEnvelope(param: AudioParam, events: readonly KeyEvent[], base: number, ramp?: number): void`
  - `findRescheduleIndex(events: readonly KeyEvent[], cutoff: number): number` — index of the first key-down that starts a token strictly after `cutoff`, or -1
  - `interface PlayOptions { text: string; timing: Timing; pitchHz: number; volume: number; onEnd?: () => void }`
  - `interface PlaybackHandle { stop(): void; setTiming(timing: Timing): void; isPlaying(): boolean }`
  - `class MorseEngine { play(opts: PlayOptions): PlaybackHandle; stop(): void }`, singleton `engine: MorseEngine`

- [ ] **Step 1: Write failing tests**

`src/audio/envelope.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { encode } from '../morse/encoder'
import { makeTiming } from '../morse/timing'
import { raisedCosine, RAMP_SECONDS, scheduleEnvelope } from './envelope'

describe('raisedCosine', () => {
  it('rises monotonically from 0 to 1', () => {
    const c = raisedCosine(64, true)
    expect(c[0]).toBeCloseTo(0)
    expect(c[63]).toBeCloseTo(1)
    for (let k = 1; k < c.length; k++) expect(c[k]).toBeGreaterThanOrEqual(c[k - 1])
  })

  it('falls from 1 to 0', () => {
    const c = raisedCosine(64, false)
    expect(c[0]).toBeCloseTo(1)
    expect(c[63]).toBeCloseTo(0)
  })
})

describe('scheduleEnvelope', () => {
  it('schedules one ramp per key event, offset by base', () => {
    const param = { setValueCurveAtTime: vi.fn() }
    const { events } = encode('EE', makeTiming({ charWpm: 20, effWpm: 20, extraWordGap: 0 }))
    scheduleEnvelope(param as unknown as AudioParam, events, 2)
    expect(param.setValueCurveAtTime).toHaveBeenCalledTimes(4)
    const [curve, start, duration] = param.setValueCurveAtTime.mock.calls[2]
    expect((curve as Float32Array)[0]).toBeCloseTo(0)
    expect(start).toBeCloseTo(2 + 0.24)
    expect(duration).toBe(RAMP_SECONDS)
  })
})
```

`src/audio/reschedule.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { encode } from '../morse/encoder'
import { makeTiming } from '../morse/timing'
import { findRescheduleIndex } from './reschedule'

const t20 = makeTiming({ charWpm: 20, effWpm: 20, extraWordGap: 0 })
// "AE" at 20 WPM: A = dit 0–0.06, dah 0.12–0.30; E = dit 0.48–0.54
const events = encode('AE', t20).events

describe('findRescheduleIndex', () => {
  it('returns the first token start after the cutoff', () => {
    expect(findRescheduleIndex(events, -1)).toBe(0)
    expect(findRescheduleIndex(events, 0.4)).toBe(4)
  })

  it('never splits a character: a cutoff inside A skips to E', () => {
    expect(findRescheduleIndex(events, 0.05)).toBe(4)
  })

  it('returns -1 when no token starts after the cutoff', () => {
    expect(findRescheduleIndex(events, 0.5)).toBe(-1)
    expect(findRescheduleIndex([], 0)).toBe(-1)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/audio`
Expected: FAIL — cannot resolve `./envelope` / `./reschedule`.

- [ ] **Step 3: Implement `src/audio/envelope.ts`**

```ts
import type { KeyEvent } from '../morse/encoder'

export const RAMP_SECONDS = 0.005
const CURVE_SAMPLES = 64

export function raisedCosine(samples: number, rising: boolean): Float32Array {
  const curve = new Float32Array(samples)
  for (let n = 0; n < samples; n++) {
    const v = 0.5 - 0.5 * Math.cos((Math.PI * n) / (samples - 1))
    curve[n] = rising ? v : 1 - v
  }
  return curve
}

const RISE = raisedCosine(CURVE_SAMPLES, true)
const FALL = raisedCosine(CURVE_SAMPLES, false)

/** Shapes each key-down/up with a short raised-cosine ramp so elements don't click. */
export function scheduleEnvelope(param: AudioParam, events: readonly KeyEvent[], base: number, ramp = RAMP_SECONDS): void {
  for (const e of events) param.setValueCurveAtTime(e.down ? RISE : FALL, base + e.t, ramp)
}
```

- [ ] **Step 4: Implement `src/audio/reschedule.ts`**

```ts
import type { KeyEvent } from '../morse/encoder'

/**
 * Where a speed change can take over: the first key-down that begins a new token
 * after `cutoff`. Characters already started finish at the old speed.
 */
export function findRescheduleIndex(events: readonly KeyEvent[], cutoff: number): number {
  return events.findIndex((e, k) => e.down && e.t > cutoff && (k === 0 || events[k - 1].i !== e.i))
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/audio`
Expected: PASS (6 tests).

- [ ] **Step 6: Implement `src/audio/engine.ts`**

```ts
import { encodeTokens, type KeyEvent } from '../morse/encoder'
import { tokenize } from '../morse/table'
import type { Timing } from '../morse/timing'
import { scheduleEnvelope } from './envelope'
import { findRescheduleIndex } from './reschedule'

export interface PlayOptions {
  text: string
  timing: Timing
  pitchHz: number
  volume: number
  /** Called once when playback ends, whether it finished or was stopped. */
  onEnd?: () => void
}

export interface PlaybackHandle {
  stop(): void
  /** Re-times everything not yet started; the character in progress finishes unchanged. */
  setTiming(timing: Timing): void
  isPlaying(): boolean
}

const START_DELAY = 0.1
const RESCHEDULE_MARGIN = 0.05
const TAIL = 0.05

export class MorseEngine {
  private ctx: AudioContext | null = null
  private current: PlaybackHandle | null = null

  play(opts: PlayOptions): PlaybackHandle {
    this.current?.stop()
    this.current = startPlayback(this.context(), opts)
    return this.current
  }

  stop(): void {
    this.current?.stop()
    this.current = null
  }

  private context(): AudioContext {
    this.ctx ??= new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }
}

export const engine = new MorseEngine()

function startPlayback(ctx: AudioContext, opts: PlayOptions): PlaybackHandle {
  const tokens = tokenize(opts.text)
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = opts.pitchHz
  const envelope = ctx.createGain()
  envelope.gain.value = 0
  const master = ctx.createGain()
  master.gain.value = opts.volume
  osc.connect(envelope)
  envelope.connect(master)
  master.connect(ctx.destination)

  const start = ctx.currentTime + START_DELAY
  const encoded = encodeTokens(tokens, opts.timing)
  // Absolute (AudioContext-time) copy of the schedule, needed to find where a speed change can start.
  let scheduled: KeyEvent[] = encoded.events.map((e) => ({ ...e, t: e.t + start }))
  let playing = true

  scheduleEnvelope(envelope.gain, encoded.events, start)
  osc.onended = () => {
    playing = false
    osc.disconnect()
    envelope.disconnect()
    master.disconnect()
    opts.onEnd?.()
  }
  osc.start(start)
  osc.stop(start + encoded.duration + TAIL)

  return {
    isPlaying: () => playing,
    stop() {
      if (!playing) return
      envelope.gain.cancelScheduledValues(0)
      envelope.gain.setValueAtTime(0, ctx.currentTime)
      osc.stop()
    },
    setTiming(timing) {
      if (!playing) return
      const k = findRescheduleIndex(scheduled, ctx.currentTime + RESCHEDULE_MARGIN)
      if (k < 0) return
      const at = scheduled[k].t
      const fromToken = scheduled[k].i
      const rest = encodeTokens(tokens.slice(fromToken), timing)
      envelope.gain.cancelScheduledValues(at)
      scheduleEnvelope(envelope.gain, rest.events, at)
      scheduled = [
        ...scheduled.slice(0, k),
        ...rest.events.map((e) => ({ ...e, i: e.i + fromToken, t: e.t + at })),
      ]
      osc.stop(at + rest.duration + TAIL)
    },
  }
}
```

- [ ] **Step 7: Lint and typecheck**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all green. (The engine itself is exercised in the browser by Task 11's e2e tests.)

- [ ] **Step 8: Commit**

```bash
git add src/audio
git commit -m "feat(audio): Web Audio keyer with click-free envelope and live re-timing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: App shell, routing, speed bar

**Files:**
- Create: `src/ui/useHashRoute.ts`, `src/ui/NumberField.tsx`, `src/ui/SpeedBar.tsx`, `src/ui/pages/Home.tsx`
- Modify: `src/App.tsx` (replace whole file), `src/index.css` (append)

**Interfaces:**
- Consumes: `useSettings`, `UpdateSettings` (Task 7); `Settings`, `applyLevel`, `nudgeSpeed`, `setCharWpm`, `setEffWpm`, `setLinkSpeeds`, `SPEED_MIN`, `SPEED_MAX` (Task 6); `LEVELS`, `Level` (Task 6).
- Produces:
  - `useHashRoute(): string` (e.g. `'/'`, `'/receive'`)
  - `NumberField` props `{ label: string; value: number; min: number; max: number; disabled?: boolean; onCommit: (n: number) => void }` — commits on blur/Enter, clamps and rounds
  - `SpeedBar` props `{ settings: Settings; update: UpdateSettings }` with accessible names: select "Difficulty level", inputs "Character speed (WPM)", "Effective speed (WPM)", slider "Character speed slider", checkbox "Link speeds", buttons "Slower", "Faster"
  - `Home` component; `App` renders `Receive` for `'/receive'` (Task 10 adds the page; until then App renders Home for every route)

- [ ] **Step 1: Implement `src/ui/useHashRoute.ts`**

```ts
import { useEffect, useState } from 'react'

function currentRoute(): string {
  return window.location.hash.replace(/^#/, '') || '/'
}

export function useHashRoute(): string {
  const [route, setRoute] = useState(currentRoute)
  useEffect(() => {
    const onChange = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
```

- [ ] **Step 2: Implement `src/ui/NumberField.tsx`**

```tsx
import { useState } from 'react'

interface Props {
  label: string
  value: number
  min: number
  max: number
  disabled?: boolean
  onCommit: (n: number) => void
}

/** Numeric input that only commits on blur/Enter, so typing "30" doesn't clamp at "3". */
export function NumberField({ label, value, min, max, disabled, onCommit }: Props) {
  const [draft, setDraft] = useState(String(value))
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    setDraft(String(value))
  }

  const commit = () => {
    const n = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(n)) {
      setDraft(String(value))
      return
    }
    const clamped = Math.min(max, Math.max(min, Math.round(n)))
    setDraft(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }

  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      disabled={disabled}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
    />
  )
}
```

- [ ] **Step 3: Implement `src/ui/SpeedBar.tsx`**

```tsx
import {
  applyLevel,
  nudgeSpeed,
  setCharWpm,
  setEffWpm,
  setLinkSpeeds,
  SPEED_MAX,
  SPEED_MIN,
  type Settings,
} from '../store/settings'
import type { UpdateSettings } from '../store/useSettings'
import { LEVELS, type Level } from '../training/difficulty'
import { NumberField } from './NumberField'

export function SpeedBar({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  return (
    <section className="speed-bar" aria-label="Speed and difficulty">
      <label className="field">
        <span>Difficulty</span>
        <select
          aria-label="Difficulty level"
          value={String(settings.level)}
          onChange={(e) => {
            if (e.target.value !== 'custom') update((s) => applyLevel(s, Number(e.target.value) as Level))
          }}
        >
          {LEVELS.map((l) => (
            <option key={l.level} value={l.level}>
              {l.level} · {l.name} ({l.charWpm}/{l.effWpm} WPM)
            </option>
          ))}
          <option value="custom" disabled={settings.level !== 'custom'}>
            Custom
          </option>
        </select>
      </label>

      <div className="field">
        <span>Character WPM</span>
        <div className="speed-stepper">
          <button type="button" aria-label="Slower" onClick={() => update((s) => nudgeSpeed(s, -1))}>
            −
          </button>
          <NumberField
            label="Character speed (WPM)"
            value={settings.charWpm}
            min={SPEED_MIN}
            max={SPEED_MAX}
            onCommit={(n) => update((s) => setCharWpm(s, n))}
          />
          <button type="button" aria-label="Faster" onClick={() => update((s) => nudgeSpeed(s, 1))}>
            +
          </button>
        </div>
        <input
          type="range"
          aria-label="Character speed slider"
          min={SPEED_MIN}
          max={SPEED_MAX}
          value={settings.charWpm}
          onChange={(e) => update((s) => setCharWpm(s, e.target.valueAsNumber))}
        />
      </div>

      <div className="field">
        <span>Effective WPM</span>
        <NumberField
          label="Effective speed (WPM)"
          value={settings.effWpm}
          min={SPEED_MIN}
          max={settings.charWpm}
          disabled={settings.linkSpeeds}
          onCommit={(n) => update((s) => setEffWpm(s, n))}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.linkSpeeds}
            onChange={(e) => update((s) => setLinkSpeeds(s, e.target.checked))}
          />
          Link speeds
        </label>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Implement `src/ui/pages/Home.tsx`**

```tsx
export function Home() {
  return (
    <div className="home">
      <h1>Learn Morse code for amateur radio</h1>
      <p className="lead">
        Practise copying CW by ear at your own speed. Pick a difficulty level, listen, type what you hear, and
        see exactly which characters you missed.
      </p>
      <div className="cards">
        <a className="card" href="#/receive">
          <h2>Receive practice</h2>
          <p>Listen to Morse and type what you hear. Adjustable speed and difficulty.</p>
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Replace `src/App.tsx`**

```tsx
import { useSettings } from './store/useSettings'
import { Home } from './ui/pages/Home'
import { useHashRoute } from './ui/useHashRoute'

export default function App() {
  const route = useHashRoute()
  const { loaded } = useSettings()

  return (
    <div className="app">
      <header className="app-header">
        <a className="brand" href="#/">
          <span aria-hidden="true">·−</span> CW Trainer
        </a>
        <nav>
          <a href="#/receive" aria-current={route === '/receive' ? 'page' : undefined}>
            Receive
          </a>
        </nav>
      </header>
      <main>{loaded ? <Home /> : <p>Loading…</p>}</main>
    </div>
  )
}
```

- [ ] **Step 6: Append layout styles to `src/index.css`**

```css
.app { max-width: 960px; margin: 0 auto; padding: 0 1rem 3rem; }
.app-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 0; border-bottom: 1px solid var(--border); margin-bottom: 1.5rem; }
.brand { font-weight: 700; font-size: 1.2rem; text-decoration: none; color: var(--text); }
.brand span { color: var(--accent); margin-right: 0.3rem; }
.app-header nav a { margin-left: 1rem; text-decoration: none; color: var(--muted); }
.app-header nav a[aria-current='page'] { color: var(--accent); }

.lead { color: var(--muted); font-size: 1.1rem; max-width: 60ch; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
.card { display: block; padding: 1.2rem; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; text-decoration: none; color: var(--text); }
.card:hover { border-color: var(--accent); }
.card h2 { margin: 0 0 0.4rem; font-size: 1.1rem; color: var(--accent); }
.card p { margin: 0; color: var(--muted); }

.speed-bar { display: flex; flex-wrap: wrap; gap: 1.2rem; align-items: flex-start; padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 1.5rem; }
.field { display: flex; flex-direction: column; gap: 0.35rem; }
.field > span { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.speed-stepper { display: flex; gap: 0.3rem; }
.speed-stepper input { width: 4.5rem; text-align: center; }
.field input[type='number'] { width: 4.5rem; }
.field input[type='range'] { padding: 0; accent-color: var(--accent); }
.checkbox { display: flex; gap: 0.4rem; align-items: center; font-size: 0.9rem; color: var(--muted); }
```

- [ ] **Step 7: Verify manually and with checks**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all green.
Run: `npm run dev`, open `http://localhost:5173/` — header and Home card render; `#/receive` still shows Home (the page arrives in Task 10). Stop the server.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "feat(ui): app shell, hash routing, speed and difficulty bar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Receive page

**Files:**
- Create: `src/ui/ScoreView.tsx`, `src/ui/pages/Receive.tsx`
- Modify: `src/App.tsx` (replace whole file), `src/index.css` (append)

**Interfaces:**
- Consumes: `engine`, `PlaybackHandle` (Task 8); `makeTiming` (Task 3); `newSeed` (Task 4); `makeItem`, `ExerciseItem` (Task 6); `score`, `ScoreResult`, `Op` (Task 5); `nudgeSpeed`, `Settings` (Task 6); `UpdateSettings` (Task 7); `SpeedBar` (Task 9).
- Produces: `Receive` page with accessible elements used by e2e: buttons "Play"/"Next", "Repeat", "Stop"; `role="status"` showing `Ready` / `Playing…` / `Finished`; text input labelled "Type what you hear"; submit button "Check"; result text `Accuracy: N%`; `data-testid="sent-text"`.

- [ ] **Step 1: Implement `src/ui/ScoreView.tsx`**

```tsx
import type { Op, ScoreResult } from '../training/scoring'

function OpView({ op }: { op: Op }) {
  switch (op.kind) {
    case 'match':
      return <span className="op op-match">{op.char}</span>
    case 'sub':
      return (
        <span className="op op-sub" title={`You typed ${op.typed}`}>
          {op.expected}
        </span>
      )
    case 'missing':
      return (
        <span className="op op-missing" title="Missed">
          {op.expected}
        </span>
      )
    case 'extra':
      return (
        <span className="op op-extra" title="Extra character">
          {op.typed}
        </span>
      )
  }
}

export function ScoreView({ expected, result }: { expected: string; result: ScoreResult }) {
  return (
    <section className="score" aria-label="Result">
      <p className="accuracy">Accuracy: {Math.round(result.accuracy * 100)}%</p>
      <p>
        Sent: <code data-testid="sent-text">{expected}</code>
      </p>
      <p className="ops mono">
        {result.ops.map((op, k) => (
          <OpView key={k} op={op} />
        ))}
      </p>
      <p className="legend">
        <span className="op op-match">correct</span> <span className="op op-sub">wrong</span>{' '}
        <span className="op op-missing">missed</span> <span className="op op-extra">extra</span>
      </p>
    </section>
  )
}
```

- [ ] **Step 2: Implement `src/ui/pages/Receive.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { engine, type PlaybackHandle } from '../../audio/engine'
import { newSeed } from '../../content/rng'
import { makeTiming } from '../../morse/timing'
import { nudgeSpeed, type Settings } from '../../store/settings'
import type { UpdateSettings } from '../../store/useSettings'
import { makeItem, type ExerciseItem } from '../../training/itemSource'
import { score, type ScoreResult } from '../../training/scoring'
import { ScoreView } from '../ScoreView'
import { SpeedBar } from '../SpeedBar'

type Status = 'ready' | 'playing' | 'finished'
const STATUS_TEXT: Record<Status, string> = { ready: 'Ready', playing: 'Playing…', finished: 'Finished' }

export function Receive({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  const [item, setItem] = useState<ExerciseItem | null>(null)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<ScoreResult | null>(null)
  const [status, setStatus] = useState<Status>('ready')
  const handleRef = useRef<PlaybackHandle | null>(null)
  const answerRef = useRef<HTMLInputElement>(null)

  const play = useCallback(
    (it: ExerciseItem) => {
      setStatus('playing')
      const handle = engine.play({
        text: it.text,
        timing: makeTiming(settings),
        pitchHz: settings.pitchHz,
        volume: settings.volume,
        onEnd: () => {
          // Ignore the end of a playback that a newer one already replaced.
          if (handleRef.current !== handle) return
          handleRef.current = null
          setStatus('finished')
        },
      })
      handleRef.current = handle
    },
    [settings],
  )

  const next = useCallback(() => {
    const it = makeItem(settings.level, newSeed())
    setItem(it)
    setAnswer('')
    setResult(null)
    play(it)
  }, [settings.level, play])

  const repeat = useCallback(() => {
    if (item) play(item)
  }, [item, play])

  const stop = useCallback(() => engine.stop(), [])

  const submit = () => {
    if (!item || result) return
    handleRef.current = null
    engine.stop()
    setStatus('finished')
    setResult(score(item.text, answer))
  }

  // Speed changes re-time the rest of the item that is currently playing.
  const { charWpm, effWpm, extraWordGap } = settings
  useEffect(() => {
    handleRef.current?.setTiming(makeTiming({ charWpm, effWpm, extraWordGap }))
  }, [charWpm, effWpm, extraWordGap])

  useEffect(() => {
    if (item && !result) answerRef.current?.focus()
  }, [item, result])

  useEffect(() => () => engine.stop(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 5 : 1
      if (e.key === 'Escape') return stop()
      if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault()
        return update((s) => nudgeSpeed(s, e.key === 'PageUp' ? step : -step))
      }
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 'Enter' || e.key === ' ') {
        if (tag === 'BUTTON') return
        e.preventDefault()
        next()
      } else if (e.key === 'r' || e.key === 'R') repeat()
      else if (e.key === '+' || e.key === '=') update((s) => nudgeSpeed(s, 1))
      else if (e.key === '-' || e.key === '_') update((s) => nudgeSpeed(s, -1))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [next, repeat, stop, update])

  const answering = item !== null && result === null

  return (
    <div className="receive">
      <h1>Receive</h1>
      <SpeedBar settings={settings} update={update} />

      <div className="controls">
        <button type="button" className="primary" onClick={next}>
          {item ? 'Next' : 'Play'}
        </button>
        <button type="button" onClick={repeat} disabled={!item}>
          Repeat
        </button>
        <button type="button" onClick={stop} disabled={status !== 'playing'}>
          Stop
        </button>
        <span role="status" className={`status status-${status}`}>
          {STATUS_TEXT[status]}
        </span>
      </div>

      <form
        className="answer"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label htmlFor="answer">Type what you hear</label>
        <div className="answer-row">
          <input
            id="answer"
            ref={answerRef}
            className="mono"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={answer}
            disabled={!answering}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <button type="submit" disabled={!answering}>
            Check
          </button>
        </div>
      </form>

      {result && item && <ScoreView expected={item.text} result={result} />}

      <p className="hint">
        Enter/Space: play next · R: repeat · Esc: stop · +/−: speed · PageUp/PageDown: speed while typing (Shift ×5)
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Replace `src/App.tsx` to route to Receive**

```tsx
import { useSettings } from './store/useSettings'
import { Home } from './ui/pages/Home'
import { Receive } from './ui/pages/Receive'
import { useHashRoute } from './ui/useHashRoute'

export default function App() {
  const route = useHashRoute()
  const { settings, update, loaded } = useSettings()

  let page = <Home />
  if (route === '/receive') page = <Receive settings={settings} update={update} />

  return (
    <div className="app">
      <header className="app-header">
        <a className="brand" href="#/">
          <span aria-hidden="true">·−</span> CW Trainer
        </a>
        <nav>
          <a href="#/receive" aria-current={route === '/receive' ? 'page' : undefined}>
            Receive
          </a>
        </nav>
      </header>
      <main>{loaded ? page : <p>Loading…</p>}</main>
    </div>
  )
}
```

- [ ] **Step 4: Append Receive styles to `src/index.css`**

```css
.controls { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; margin-bottom: 1.2rem; }
.status { margin-left: auto; font-size: 0.9rem; padding: 0.2rem 0.7rem; border-radius: 999px; background: var(--surface-2); color: var(--muted); }
.status-playing { color: var(--accent); }
.status-finished { color: var(--ok); }

.answer { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 1.2rem; }
.answer label { color: var(--muted); }
.answer-row { display: flex; gap: 0.6rem; }
.answer-row input { flex: 1; font-size: 1.4rem; letter-spacing: 0.15em; text-transform: uppercase; }

.score { padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
.accuracy { font-size: 1.4rem; font-weight: 700; margin: 0 0 0.5rem; }
.ops { font-size: 1.4rem; letter-spacing: 0.1em; white-space: pre-wrap; }
.op { white-space: pre; border-radius: 3px; padding: 0 1px; }
.op-match { color: var(--ok); }
.op-sub { color: var(--bad); text-decoration: underline wavy; }
.op-missing { color: var(--warn); opacity: 0.8; text-decoration: underline dotted; }
.op-extra { color: var(--muted); text-decoration: line-through; }
.legend { font-size: 0.85rem; color: var(--muted); }
.hint { color: var(--muted); font-size: 0.85rem; margin-top: 2rem; }
```

- [ ] **Step 5: Verify manually**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all green.
Run: `npm run dev`, open `http://localhost:5173/#/receive`:
1. Click **Play** — hear Morse at 20/10 WPM; status shows "Playing…" then "Finished".
2. Type the groups, press Enter — see Accuracy and the coloured comparison.
3. Press Enter (outside the input) — next item plays.
4. While an item plays, click **Faster** several times — the rest of the item speeds up without clicks; status still ends at "Finished".
5. Choose level 1 — hear slow Farnsworth spacing with short groups.
6. Reload — speed/level are remembered.
Stop the server.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat(ui): receive practice page with scoring and live speed control

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: End-to-end tests and CI integration

**Files:**
- Create: `playwright.config.ts`, `e2e/receive.spec.ts`
- Modify: `package.json` (add `test:e2e` script via npm pkg), `.github/workflows/checks.yml` (append e2e steps)

**Interfaces:**
- Consumes: the accessible names produced by Tasks 9–10.
- Produces: `npm run test:e2e`; CI runs Playwright on Chromium.

- [ ] **Step 1: Install Playwright**

Run:
```bash
npm install -D @playwright/test@^1.63
npm pkg set scripts.test:e2e="playwright test"
npx playwright install chromium
```
Expected: Chromium downloaded.

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

- [ ] **Step 3: Write e2e tests** — `e2e/receive.spec.ts`

```ts
import { expect, test, type Page } from '@playwright/test'

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  return errors
}

async function openReceiveAtContestSpeed(page: Page) {
  await page.goto('/#/receive')
  await page.getByLabel('Difficulty level').selectOption('6')
}

test('home links to receive practice', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Receive practice/ }).click()
  await expect(page.getByRole('heading', { name: 'Receive' })).toBeVisible()
})

test('plays an item and scores the typed answer', async ({ page }) => {
  const errors = collectErrors(page)
  await openReceiveAtContestSpeed(page)
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByRole('status')).toHaveText('Playing…')
  const answer = page.getByLabel('Type what you hear')
  await expect(answer).toBeFocused()
  await answer.fill('zzzzz')
  await answer.press('Enter')
  await expect(page.getByText(/Accuracy: \d+%/)).toBeVisible()
  await expect(page.getByTestId('sent-text')).toHaveText(/^[A-Z0-9]{5}( [A-Z0-9]{5}){4}$/)
  expect(errors).toEqual([])
})

test('playback reaches the end after a speed change mid-item', async ({ page }) => {
  const errors = collectErrors(page)
  await openReceiveAtContestSpeed(page)
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByRole('status')).toHaveText('Playing…')
  await page.getByRole('button', { name: 'Faster' }).click()
  await page.getByRole('button', { name: 'Faster' }).click()
  await expect(page.getByLabel('Character speed (WPM)')).toHaveValue('37')
  await expect(page.getByRole('status')).toHaveText('Finished', { timeout: 20_000 })
  expect(errors).toEqual([])
})

test('rapid replays leave a single clean playback', async ({ page }) => {
  const errors = collectErrors(page)
  await openReceiveAtContestSpeed(page)
  await page.getByRole('button', { name: 'Play' }).click()
  for (let k = 0; k < 4; k++) await page.getByRole('button', { name: 'Repeat' }).click()
  await expect(page.getByRole('status')).toHaveText('Playing…')
  await expect(page.getByRole('status')).toHaveText('Finished', { timeout: 20_000 })
  expect(errors).toEqual([])
})

test('speed hotkeys switch to custom and settings survive a reload', async ({ page }) => {
  await page.goto('/#/receive')
  await page.getByRole('heading', { name: 'Receive' }).click()
  await page.keyboard.press('+')
  await expect(page.getByLabel('Character speed (WPM)')).toHaveValue('21')
  await expect(page.getByLabel('Difficulty level')).toHaveValue('custom')

  const speed = page.getByLabel('Character speed (WPM)')
  await speed.fill('30')
  await speed.press('Enter')
  await expect(speed).toHaveValue('30')
  await page.reload()
  await expect(page.getByLabel('Character speed (WPM)')).toHaveValue('30')
})
```

- [ ] **Step 4: Run e2e tests**

Run: `npm run test:e2e`
Expected: 5 passed.

- [ ] **Step 5: Add e2e to `.github/workflows/checks.yml`** — append after the `npm run build` step:

```yaml
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

- [ ] **Step 6: Run the full local check suite**

Run: `npm run lint && npm run typecheck && npm test && npm run test:e2e && npx --yes yaml-lint .github/workflows/*.yml`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: Playwright end-to-end tests for receive practice, run in CI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Publish (needs the user)**

Ask the user to create the GitHub repository (suggested name `radio-amatur`) and confirm before pushing. Then:
```bash
git remote add origin git@github.com:<user>/radio-amatur.git
git push -u origin main
```
Remind them: Settings → Pages → Source = **GitHub Actions**. Confirm the Deploy workflow succeeds and the site loads at `https://<user>.github.io/radio-amatur/#/receive`.
