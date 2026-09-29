# Morse Trainer — Design Spec

Date: 2026-09-29
Status: Draft for review

## 1. Purpose

A browser-based Morse code (CW) trainer for someone entering amateur radio who wants to
(1) pass a licence exam that includes a Morse receive/send test and (2) become a
competent on-air CW operator.

Success criteria:

- Effectively unlimited, non-repeating practice material (characters, words, sentences,
  callsigns, QSOs, exam texts) — generated, not hand-written.
- Two directions: **receive** (audio → text, user types what they hear) and
  **send** (text → audio, user keys the text; the app decodes and scores it).
- Audio can be clean or degraded with user-selected, individually adjustable
  impairments: white noise, pink noise, QSB fading, QRM, QRN, bad-fist timing/pitch.
- Measurable progress: per-character accuracy, confusion matrix, speed history.
- Runs fully in the browser, offline-capable, deployed to GitHub Pages by CI.

## 2. Constraints and decisions

| Decision | Choice |
|---|---|
| Stack | React 19 + Vite 8 + TypeScript 6.0 (pinned below 6.1 for tooling compatibility), plain CSS (no UI framework), oxlint |
| Audio | Web Audio API, synthesized in real time; no audio files shipped |
| Storage | Browser only: IndexedDB (via `idb-keyval`), JSON export/import |
| Backend | None |
| Character set | ITU: A–Z, 0–9, `. , ? / = + -` and prosigns `<AR> <SK> <BT> <KN>` (prosigns only in QSO/exam content, off by default elsewhere) |
| Language | English only |
| Keying input | Keyboard (straight key + iambic paddle), mouse buttons, Web MIDI, Web Serial |
| Hosting | GitHub Pages, built and deployed by GitHub Actions |
| Target browsers | Current Chrome/Edge/Firefox/Safari desktop; mobile receive-only is acceptable. Web MIDI/Serial are Chromium-only — feature-detected, hidden elsewhere |

## 3. Architecture

Single-page static app. Pure logic lives in framework-free TypeScript modules
(testable in Node); React only renders and wires them.

```
src/
  morse/      table, timing, encoder (text → KeyEvent[]), decoder (timings → text)
  audio/      engine, keyer, impairments/*, presets, wav export
  content/    rng, generators/*, data/* (word & sentence lists)
  keying/     input adapters (keyboard, mouse, midi, serial), iambic keyer
  training/   modes, scoring, adaptive control, Koch course, spaced repetition
  store/      persistence, settings, progress, export/import
  ui/         React components and pages
```

### 3.1 `morse/`

- `table.ts`: char ↔ pattern map (`'A' → '.-'`), prosigns as tokens like `<AR>`.
- `timing.ts`: `unitMs(wpm) = 1200 / wpm` (PARIS). Farnsworth: characters at
  `charWpm`, inter-character and inter-word gaps stretched so the overall rate is
  `effWpm` (ARRL formula). Returns element, char-gap, word-gap durations.
- `encoder.ts`: `encode(text, timing) → KeyEvent[]` where
  `KeyEvent = { down: boolean; t: number /* seconds from start */ }`.
  Unknown characters are skipped.
- `decoder.ts`: `decode(marks: {on: number; off: number}[]) → string`.
  Adaptive: keeps a running estimate of the dit length (k-means with 2 clusters over
  recent key-down durations, seeded from the configured WPM). Classifies marks into
  dit/dah (threshold = 2 × dit), gaps into element/char/word (thresholds 2× and 5×
  dit). Also returns per-element timing error for the send-quality score.

### 3.2 `audio/`

- `engine.ts`: owns one `AudioContext`. `play(exercise, settings) → PlaybackHandle`
  (stop, onEnd, progress). Everything is scheduled ahead on `ctx.currentTime`.
- `keyer.ts`: oscillator → envelope `GainNode`. Each element gets a 5 ms raised-cosine
  ramp (`setValueCurveAtTime`) to avoid clicks.
- Signal graph:
  `signal (keyer) → QSB gain → mix bus ← noise ← QRN ← QRM stations → receiver bandpass (optional) → master gain → destination`.
- `impairments/` — each is a factory `(ctx, rng, params) → { connect, schedule(duration), dispose }`:

| Impairment | Parameters | Implementation |
|---|---|---|
| White noise | level (SNR dB, −10…+30) | looping 2 s white-noise `AudioBuffer` |
| Pink noise | level (SNR dB) | looping buffer from Paul Kellet's pink filter |
| Receiver bandwidth | off / 250 / 500 / 2400 Hz | `BiquadFilterNode` bandpass centered on pitch; applied to the whole mix |
| QSB | depth 0–30 dB, rate 0.05–0.5 Hz | seeded random-walk curve on the signal gain |
| QRM | stations 0–3, level, pitch offset range ±50–400 Hz | extra keyers sending generated callsigns/CQ/exchanges at their own WPM |
| QRN | crashes/min 0–60, level | short noise bursts with exponential decay at Poisson times |
| Bad fist | jitter 0–30 %, speed drift %, chirp Hz, pitch drift Hz | jitter applied to `KeyEvent[]` before scheduling; chirp as a short frequency glide at each key-down; drift as a slow frequency ramp |

- `presets.ts`: Clean, Light noise, Contest pileup (QRM 3, fast), Weak DX
  (low SNR + deep QSB), Poor conditions (all on). Presets only set parameters; the
  user can tweak afterward.
- `wav.ts`: renders the same exercise through an `OfflineAudioContext` and downloads
  a 16-bit mono WAV.
- **Determinism:** each exercise carries a `seed`; all randomness (content,
  impairments, jitter) comes from a seeded PRNG (`mulberry32`), so "Repeat" reproduces
  it exactly.

### 3.3 `content/`

`Generator = (rng, options) → ExerciseItem` where
`ExerciseItem = { text: string; kind: string; seed: number }`.

| Generator | Output |
|---|---|
| `groups` | random groups of N chars from a character set (Koch set, custom set, or weighted by weakness) |
| `words` | ~45k English words ranked by frequency (FrequencyWords / OpenSubtitles 2018, MIT), filtered by rank and length per level |
| `sentences` | ~200k English sentences from Tatoeba (CC BY 2.0 FR), split into easy / medium / hard by length and word rarity |
| `callsigns` | ITU-style prefixes (table of real prefixes with realistic digit/suffix patterns), portable `/P`, `/M` |
| `numbers` | numbers, RST (e.g. `599`, `579`), contest serials, `5NN` cut numbers |
| `qcodes` | Q-codes and CW abbreviations with meanings (QTH, QRZ, QSL, QRM, TNX, FB, OM, WX, 73…) |
| `qso` | full templated QSOs: CQ → answer → RST/name/QTH exchange → rig/WX → 73 SK; one transmission per item |
| `contest` | contest exchanges: callsign `5NN` cut-number serial |

**Content data pipeline.** Word and sentence data is downloaded and processed offline by
`npm run content:build` (`scripts/content/`), and the output is committed to
`public/content/` so CI never downloads anything:

- Sentences: curly apostrophes normalized, apostrophes removed (`DON'T` → `DONT`, as
  CW operators send), `!` → `.`, uppercased; kept only if every character is in the
  Morse set and length is 8–80. Deduplicated, and dropped if any word is on the
  LDNOOBW English blocklist (CC BY 4.0) or is not in the 50k word list (drops odd
  names/typos). Levels: *easy* (≤ 30 chars, all words in top 2,000), *medium*
  (≤ 50 chars, all words in top 10,000), *hard* (the rest). Deterministically shuffled
  and capped at 70,000 per level, stored as JSON chunks of 5,000 sentences.
- Words: letters only, contraction fragments (`don`, `isn`, `ve`…) and blocklisted
  words removed, frequency order kept.
- `public/content/manifest.json` lists files, counts and sources. The browser fetches
  the manifest, the word list, and one sentence chunk at a time
  (`BASE_URL + content/…`), caching each; a failed fetch shows an error and can be
  retried.
- Attribution for all sources is shown in the app footer and in
  `public/content/SOURCES.md`.

Content choice: each practice screen has a **Content type** selector — Auto (by
difficulty level), Letter groups, Words, Sentences, Callsigns, Numbers & RST,
Q-codes & abbreviations, QSO exchanges, Contest exchanges. Auto maps levels to content
as in §3.5.1; explicit choices still scale with the level (word rank/length,
sentence difficulty). Prosigns are sent as `=` (BT), `+` (AR), `<KN>`, `<SK>`; scoring
ignores `<` and `>` so typing `KN` or `<KN>` both count.

The `exam` generator (exam-style text + 5-char groups) moves to the exam-simulator plan.

### 3.4 `keying/`

- Common interface: adapters emit `{ type: 'down' | 'up', t: DOMHighResTimeStamp, paddle?: 'dit' | 'dah' | 'straight' }`.
- `keyboard.ts`: straight key = Space; paddles = configurable keys (default `[` dit,
  `]` dah; also Left/Right Ctrl). Key repeat ignored.
- `mouse.ts`: left button = dit / straight, right button = dah.
- `midi.ts`: Web MIDI; configurable note numbers for dit/dah/straight
  (matches common USB-MIDI CW adapters like vail-adapter).
- `serial.ts`: Web Serial; reads CTS/DSR modem lines via `getSignals()` polling
  (~2 ms) — the standard wiring of USB-serial key interfaces.
- `iambic.ts`: turns paddle states into elements. Modes A and B, dot/dash memory,
  configurable WPM. Straight-key input bypasses it.
- Sidetone: pressed key drives the same keyer (without impairments), latency-minimized.

### 3.5 `training/`

Modes:

1. **Receive** — choose content type + settings, play, type answer, score. Options:
   per-character instant mode (type while it plays, like LCWO), or whole-item mode.
2. **Head copy** — play, reveal answer after, self-grade.
3. **Send** — prompt text shown; user keys; decoder shows live decoded text; score
   on accuracy + timing consistency; timing timeline (ideal vs actual bars).
4. **Koch course** — lesson N teaches the first N+1 chars of the Koch order
   (`K M U R E S N A P T L W I . J Z = F O Y , V G 5 / Q 9 2 H 3 8 B ? 4 7 C 1 D 6 0 X`),
   character speed default 20 WPM; advance when a ≥ 1-minute session scores ≥ 90 %.
5. **QSO simulator** — app plays the other station's transmissions (with chosen
   impairments); user copies (receive) and optionally replies (send).
6. **Exam simulator** — configurable speed and duration (e.g. 5 WPM / 5 min, or
   12 WPM); pass rule: default 1 minute of solid copy or ≥ 90 % accuracy
   (configurable, because rules differ by country).
7. **Stats** — per-char accuracy, confusion matrix heatmap, WPM over time,
   minutes practiced per day.

Scoring (`scoring.ts`): Levenshtein alignment of expected vs typed; returns
per-character correct/substituted/missed/extra; feeds the confusion matrix and
per-character stats. Case-insensitive; whitespace-normalized.

Adaptive (`adaptive.ts`): optional. After each item, rolling accuracy over the last
10 items: > 90 % → +1 WPM (or +2 dB harder SNR if "adapt noise" chosen);
< 70 % → −1 WPM. Clamped to user's min/max.

Weakness weighting: each character keeps an exponentially-weighted error rate;
group generators sample characters proportionally to `0.5 + errorRate`.

### 3.5.1 Speed and difficulty control

Speed is a first-class control, visible on every practice screen (not only in the
settings drawer):

- **Character speed** (WPM of each character): 5–60 WPM, slider + numeric input,
  step 1. Hotkeys: `+` / `-` change it by 1 WPM when focus is not in a text field; `PageUp` / `PageDown` change it by 1 WPM anywhere (`Shift` = 5 WPM).
- **Effective speed** (Farnsworth): ≤ character speed; a "link" toggle keeps them
  equal. Lets beginners hear characters at full speed with longer gaps.
- **Word spacing extra**: 0–5× additional word gap, for head-copy beginners.
- Changes apply from the next item; during playback the "Slower / Faster" buttons
  re-schedule the remaining text at the new speed immediately.
- **Difficulty levels** — one-click profiles that set speed *and* conditions
  together; every value remains individually adjustable afterward ("Custom"):

| Level | Char / eff WPM | Content length | Conditions |
|---|---|---|---|
| 1 Novice | 18 / 5 | short (1–3 chars, short words) | Clean |
| 2 Beginner | 20 / 10 | words ≤ 5 letters | Clean |
| 3 Intermediate | 20 / 15 | words, callsigns | Light noise (SNR +15 dB) |
| 4 Advanced | 25 / 25 | sentences, QSOs | Noise + light QSB + 1 QRM |
| 5 Expert | 30 / 30 | sentences, QSOs | Poor conditions, bad fist |
| 6 Contest | 35 / 35 | callsigns + serials | Contest pileup |

- Adaptive mode (above) moves speed (and optionally SNR) automatically within the
  user's min/max; the current level is shown and the WPM history is plotted in Stats.

### 3.5.2 Quiz

A timed, shareable test built from the same content generators.

- **Quiz maker** (`#/quiz`): questions 1–100 (default 30); time limit for the whole quiz
  1–60 min or none (default 10); plays per question 1–10 or unlimited (default 3);
  answer mode *Type* or *Multiple choice (4 options)*; pass mark for typed answers
  50–100 % character accuracy (default 100 %); content type, difficulty level, speed and
  band conditions (defaults: current settings).
- **Share link**: settings + seed encoded in the URL hash; opening it reproduces the exact
  same questions. Malformed links fall back to defaults.
- **Run**: question *n / N*, countdown, Play button showing plays left (the automatic first
  play counts). Typed mode: answer box, Enter submits. Multiple choice: 4 buttons or keys
  1–4; distractors are the same content type and similar length. No going back; *Skip*
  counts as incorrect. When time runs out, unanswered questions count as incorrect.
- **Results**: correct % and incorrect % (with counts, unanswered/skipped shown), time used,
  per-question table (sent text, answer with diff, accuracy, plays used, ✓/✗). Actions:
  Retry same quiz, New quiz, Copy link.
- **History**: the last 100 results stored in IndexedDB, listed on the quiz page and
  re-openable.
- Modules: `quiz/config.ts` (config, clamping, share-link codec), `quiz/generate.ts`
  (seeded questions + distractors), `quiz/session.ts` (pure state machine: play, answer,
  skip, timeout, finish), `quiz/results.ts`, `store/quizHistory.ts`; pages QuizMaker,
  QuizRun, QuizResults.

### 3.6 `store/`

- `settings`: audio, impairments, keying, UI — one object, versioned (`schemaVersion`)
  with migrations.
- `progress`: per-char stats, confusion counts, session log
  (`{date, mode, wpm, accuracy, durationSec}`), Koch lesson.
- Export/import as a single JSON file; import validates `schemaVersion`.

### 3.7 UI

- Routes (hash router, so GitHub Pages needs no rewrite rules): `#/` home,
  `#/receive`, `#/send`, `#/koch`, `#/qso`, `#/exam`, `#/stats`, `#/settings`.
- Speed bar (char WPM, effective WPM, difficulty level) pinned on every practice screen.
- Persistent side settings drawer: pitch, volume, impairment
  toggles/sliders, preset selector.
- Keyboard-first: Enter = play/next, R = repeat, Esc = stop, +/- and PageUp/PageDown = speed.
- Dark theme by default, light theme toggle. Responsive; send mode is desktop-focused.
- PWA via `vite-plugin-pwa`: installable and fully offline after first load.
- First user gesture unlocks the `AudioContext` (browser autoplay policy).

## 4. Build, CI/CD, deployment

- `npm run dev`, `npm run build` (→ `dist/`), `npm test` (Vitest),
  `npm run test:e2e` (Playwright), `npm run lint` (oxlint), `npm run typecheck` (`tsc -b`).
- Vite `base` set to `/<repo-name>/` for Pages (read from env `BASE_PATH`,
  defaulting to `/`).
- **`.github/workflows/ci.yml`** — on pull requests and pushes: install, lint,
  typecheck, unit tests, build, Playwright smoke tests.
- **`.github/workflows/deploy.yml`** — on push to `main` (and manual
  `workflow_dispatch`): run the same checks, build, then publish with
  `actions/upload-pages-artifact` + `actions/deploy-pages`. Repo setting:
  Pages → Source = "GitHub Actions".
- **Built output alongside source:** the deploy workflow also pushes the built
  `dist/` to a `gh-pages` branch (via `peaceiris/actions-gh-pages`) so the full
  static build is browsable/downloadable in the repo, and attaches `dist.zip` as a
  workflow artifact. Source stays on `main`; `dist/` stays in `.gitignore` on `main`.
  (Pages serves from the Actions deployment; the `gh-pages` branch is an archive
  copy that can alternatively be selected as the Pages source.)

## 5. Testing

Unit (Vitest, Node, no browser):
- timing: unit length at 20 WPM = 60 ms; Farnsworth gaps match the ARRL formula.
- difficulty: each level profile produces the documented settings; live speed change re-schedules only the remaining events.
- encoder: `PARIS ` spans exactly 50 units.
- decoder round-trip: for random text × WPM 5–40 × jitter 0–20 %, `decode(encode(x)) == x`
  (≥ 99 % char accuracy at 20 % jitter).
- iambic: mode A vs B squeeze behavior on scripted paddle timelines.
- scoring: alignment on known cases (insert/delete/substitute).
- generators: same seed → same output; callsigns match a validity regex; only
  allowed characters emitted.
- Koch progression and adaptive rules.
- store: migration and export/import round-trip.

Audio (Vitest + `OfflineAudioContext` via `node-web-audio-api`, or Playwright if
unavailable): render a known exercise, check RMS energy is present only in
expected key-down windows (clean) and that the noise floor rises with the SNR setting.

E2E (Playwright, Chromium): load app, play a receive item, type answer, see score;
send mode with keyboard keying decodes `TEST`; settings persist across reload.

## 6. Out of scope (YAGNI)

Accounts/sync, leaderboards, languages other than English, Persian Morse, real
radio/CAT control, speech-recognition, native mobile apps.

## 7. Build order (milestones)

1. Scaffold + CI/CD + Pages deploy of a hello-world.
2. `morse/` + `audio/` keyer (clean) + Receive mode with random groups.
3. Impairments + presets + WAV export.
4. Content generators + data files.
5. Scoring, stats, store.
6. Koch course, adaptive, exam simulator.
7. Keying adapters + decoder + Send mode.
8. QSO simulator, PWA, polish.
