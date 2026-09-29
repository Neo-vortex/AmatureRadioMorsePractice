# Plan 2 — Impairments: Noise, Filter, QSB, QRM, QRN, Bad Fist, Presets, WAV

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receive practice can sound like a real band: white/pink noise at a chosen SNR, receiver bandwidth filter, QSB fading, QRM interfering stations, QRN static crashes, and a "bad fist" (timing jitter, speed drift, chirp, pitch drift) — each adjustable, with presets tied to the difficulty levels, and any exercise downloadable as WAV.

**Architecture:** Pure, seeded DSP/planning helpers (`src/audio/dsp.ts`, `qrm.ts`, `chirp.ts`, `wav.ts`) are unit-tested in Node. `src/audio/graph.ts` builds the Web Audio graph on any `BaseAudioContext`, so the live engine (`AudioContext`) and WAV export (`OfflineAudioContext`) share one code path. Conditions live in settings (v3); difficulty levels apply a preset.

**Tech Stack:** Web Audio API (OscillatorNode, GainNode, BiquadFilterNode, AudioBufferSourceNode, OfflineAudioContext), existing React/Vitest/Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-morse-trainer-design.md` §3.2 (impairments), §3.5.1 (levels → conditions)

## Global Constraints

- Every random choice (noise samples, QSB phases, QRN times, QRM stations, jitter) comes from `mulberry32` seeded from the exercise seed → "Repeat" and WAV export reproduce the exact sound.
- Parameter ranges (clamped on load): SNR −10…+30 dB; bandwidth off/250/500/2400 Hz; QSB depth 0–30 dB, rate 0.05–0.5 Hz; QRM stations 0–3, level −30…+6 dB, max offset 50–400 Hz; QRN 0–60 per minute, level −30…+6 dB; jitter 0–30 %, speed drift 0–20 %, chirp 0–100 Hz, pitch drift 0–50 Hz.
- Presets: Clean, Light noise, Moderate, Weak DX, Contest pileup, Poor conditions. Level → preset: 1–2 clean, 3 light-noise, 4 moderate, 5 poor, 6 contest.
- Presets only set parameters; touching any parameter makes the preset "Custom".
- Live speed changes (Plan 1) keep working with impairments on.
- Settings `schemaVersion` 3; v1/v2 records migrate with the preset of their level.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Everything on at once (Poor conditions) at high speed** — no audio exceptions (overlapping automation curves, `stop()` misuse) and playback still ends (pinned: Task 6 e2e "poor conditions").
2. **Speed change mid-item with bad fist + chirp on** — re-timing must cancel/replace frequency automation without throwing (pinned: Task 6 e2e "poor conditions" presses Faster mid-item).
3. **Clipping** — noise + QRM + QRN + signal summed must not exceed full scale badly (pinned: Task 2 noise RMS tests + Task 6 WAV peak check).
4. **Old settings without conditions** — load with the level's preset (pinned: Task 5 migration tests).
5. **Deterministic repeat** — same seed ⇒ identical WAV bytes (pinned: Task 6 e2e WAV determinism).

---

## File Structure

```
src/audio/conditions.ts   Conditions type, CLEAN, PRESETS, labels, normalizeConditions
src/audio/dsp.ts          whiteNoise, pinkNoise, rms, dbToGain, qsbCurve, poissonTimes, crashBuffer, applyFist
src/audio/qrm.ts          planQrm → QrmStation[]
src/audio/chirp.ts        scheduleChirp, driftCents
src/audio/wav.ts          encodeWav (16-bit PCM mono)
src/audio/graph.ts        buildGraph(ctx, destination, options, start) → Graph (browser)
src/audio/render.ts       renderWav(options) → Blob via OfflineAudioContext (browser)
src/audio/engine.ts       uses buildGraph; PlayOptions gains conditions + seed
src/store/settings.ts     v3: conditions, conditionsPreset; setters; migration
src/ui/Slider.tsx         labelled range input with value readout
src/ui/ConditionsPanel.tsx  preset select + "Adjust" controls
src/ui/pages/Receive.tsx  panel, seed/conditions to engine, Download WAV
e2e/impairments.spec.ts
```

---

### Task 1: Conditions model and presets

**Files:** Create `src/audio/conditions.ts`, `src/audio/conditions.test.ts`

**Interfaces:**
- Produces: `type NoiseType = 'off' | 'white' | 'pink'`; `interface Conditions { noise: { type: NoiseType; snrDb: number }; bandwidthHz: 0 | 250 | 500 | 2400; qsb: { depthDb: number; rateHz: number }; qrm: { stations: number; levelDb: number; maxOffsetHz: number }; qrn: { perMinute: number; levelDb: number }; fist: { jitter: number; speedDrift: number; chirpHz: number; driftHz: number } }`; `BANDWIDTHS`; `PRESET_NAMES`; `type PresetName`; `PRESET_LABELS: Record<PresetName, string>`; `CLEAN: Conditions`; `PRESETS: Record<PresetName, Conditions>`; `isPresetName(x: unknown): x is PresetName`; `normalizeConditions(raw: unknown): Conditions`.

- [ ] **Step 1: Write failing tests** — `src/audio/conditions.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { CLEAN, isPresetName, normalizeConditions, PRESET_NAMES, PRESETS } from './conditions'

describe('conditions', () => {
  it('clean has every impairment off', () => {
    expect(CLEAN.noise.type).toBe('off')
    expect(CLEAN.bandwidthHz).toBe(0)
    expect(CLEAN.qsb.depthDb).toBe(0)
    expect(CLEAN.qrm.stations).toBe(0)
    expect(CLEAN.qrn.perMinute).toBe(0)
    expect(CLEAN.fist).toEqual({ jitter: 0, speedDrift: 0, chirpHz: 0, driftHz: 0 })
  })

  it('every preset is already normalized', () => {
    for (const name of PRESET_NAMES) expect(normalizeConditions(PRESETS[name]), name).toEqual(PRESETS[name])
  })

  it('poor conditions turns everything on', () => {
    const p = PRESETS.poor
    expect(p.noise.type).not.toBe('off')
    expect(p.qsb.depthDb).toBeGreaterThan(0)
    expect(p.qrm.stations).toBeGreaterThan(0)
    expect(p.qrn.perMinute).toBeGreaterThan(0)
    expect(p.fist.jitter).toBeGreaterThan(0)
  })

  it('normalizes junk to clean and clamps ranges', () => {
    expect(normalizeConditions(undefined)).toEqual(CLEAN)
    expect(normalizeConditions('x')).toEqual(CLEAN)
    const n = normalizeConditions({
      noise: { type: 'purple', snrDb: -99 },
      bandwidthHz: 333,
      qsb: { depthDb: 99, rateHz: 9 },
      qrm: { stations: 7.6, levelDb: 50, maxOffsetHz: 1 },
      qrn: { perMinute: 500, levelDb: -99 },
      fist: { jitter: 2, speedDrift: -1, chirpHz: 1000, driftHz: 'x' },
    })
    expect(n).toEqual({
      noise: { type: 'off', snrDb: -10 },
      bandwidthHz: 0,
      qsb: { depthDb: 30, rateHz: 0.5 },
      qrm: { stations: 3, levelDb: 6, maxOffsetHz: 50 },
      qrn: { perMinute: 60, levelDb: -30 },
      fist: { jitter: 0.3, speedDrift: 0, chirpHz: 100, driftHz: 0 },
    })
  })

  it('isPresetName', () => {
    expect(isPresetName('weak-dx')).toBe(true)
    expect(isPresetName('custom')).toBe(false)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/audio/conditions.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement `src/audio/conditions.ts`**

```ts
export type NoiseType = 'off' | 'white' | 'pink'

export interface Conditions {
  noise: { type: NoiseType; snrDb: number }
  /** Receiver bandpass width; 0 = no filter. */
  bandwidthHz: 0 | 250 | 500 | 2400
  qsb: { depthDb: number; rateHz: number }
  qrm: { stations: number; levelDb: number; maxOffsetHz: number }
  qrn: { perMinute: number; levelDb: number }
  /** Human sending: jitter and speedDrift are fractions (0.1 = 10 %). */
  fist: { jitter: number; speedDrift: number; chirpHz: number; driftHz: number }
}

export const BANDWIDTHS = [0, 250, 500, 2400] as const
export const PRESET_NAMES = ['clean', 'light-noise', 'moderate', 'weak-dx', 'contest', 'poor'] as const
export type PresetName = (typeof PRESET_NAMES)[number]

export const PRESET_LABELS: Record<PresetName, string> = {
  clean: 'Clean',
  'light-noise': 'Light noise',
  moderate: 'Moderate',
  'weak-dx': 'Weak DX',
  contest: 'Contest pileup',
  poor: 'Poor conditions',
}

export const CLEAN: Conditions = {
  noise: { type: 'off', snrDb: 20 },
  bandwidthHz: 0,
  qsb: { depthDb: 0, rateHz: 0.1 },
  qrm: { stations: 0, levelDb: -10, maxOffsetHz: 300 },
  qrn: { perMinute: 0, levelDb: -6 },
  fist: { jitter: 0, speedDrift: 0, chirpHz: 0, driftHz: 0 },
}

export const PRESETS: Record<PresetName, Conditions> = {
  clean: CLEAN,
  'light-noise': { ...CLEAN, noise: { type: 'pink', snrDb: 15 } },
  moderate: {
    ...CLEAN,
    noise: { type: 'pink', snrDb: 8 },
    bandwidthHz: 500,
    qsb: { depthDb: 8, rateHz: 0.1 },
    qrm: { stations: 1, levelDb: -10, maxOffsetHz: 300 },
  },
  'weak-dx': {
    ...CLEAN,
    noise: { type: 'white', snrDb: 3 },
    bandwidthHz: 500,
    qsb: { depthDb: 20, rateHz: 0.15 },
    qrn: { perMinute: 6, levelDb: -6 },
  },
  contest: {
    ...CLEAN,
    noise: { type: 'pink', snrDb: 10 },
    bandwidthHz: 500,
    qrm: { stations: 3, levelDb: -6, maxOffsetHz: 400 },
  },
  poor: {
    noise: { type: 'pink', snrDb: 0 },
    bandwidthHz: 2400,
    qsb: { depthDb: 15, rateHz: 0.2 },
    qrm: { stations: 2, levelDb: -8, maxOffsetHz: 250 },
    qrn: { perMinute: 12, levelDb: 0 },
    fist: { jitter: 0.15, speedDrift: 0.05, chirpHz: 30, driftHz: 20 },
  },
}

export function isPresetName(x: unknown): x is PresetName {
  return PRESET_NAMES.some((p) => p === x)
}

const obj = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {})

function num(x: unknown, fallback: number, min: number, max: number, integer = false): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return fallback
  const v = integer ? Math.round(x) : x
  return Math.min(max, Math.max(min, v))
}

/** Turns stored/untrusted data into valid Conditions, clamping every range. */
export function normalizeConditions(raw: unknown): Conditions {
  const r = obj(raw)
  const noise = obj(r.noise)
  const qsb = obj(r.qsb)
  const qrm = obj(r.qrm)
  const qrn = obj(r.qrn)
  const fist = obj(r.fist)
  const noiseType = noise.type === 'white' || noise.type === 'pink' ? noise.type : 'off'
  const bandwidth = BANDWIDTHS.find((b) => b === r.bandwidthHz) ?? 0
  return {
    noise: { type: noiseType, snrDb: num(noise.snrDb, CLEAN.noise.snrDb, -10, 30) },
    bandwidthHz: bandwidth,
    qsb: { depthDb: num(qsb.depthDb, 0, 0, 30), rateHz: num(qsb.rateHz, CLEAN.qsb.rateHz, 0.05, 0.5) },
    qrm: {
      stations: num(qrm.stations, 0, 0, 3, true),
      levelDb: num(qrm.levelDb, CLEAN.qrm.levelDb, -30, 6),
      maxOffsetHz: num(qrm.maxOffsetHz, CLEAN.qrm.maxOffsetHz, 50, 400),
    },
    qrn: { perMinute: num(qrn.perMinute, 0, 0, 60), levelDb: num(qrn.levelDb, CLEAN.qrn.levelDb, -30, 6) },
    fist: {
      jitter: num(fist.jitter, 0, 0, 0.3),
      speedDrift: num(fist.speedDrift, 0, 0, 0.2),
      chirpHz: num(fist.chirpHz, 0, 0, 100),
      driftHz: num(fist.driftHz, 0, 0, 50),
    },
  }
}
```

- [ ] **Step 4: Run** `npx vitest run src/audio/conditions.test.ts` — Expected: PASS (5 tests).

- [ ] **Step 5: Commit** — `git add src/audio && git commit -m "feat(audio): band-conditions model and presets" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 2: Seeded DSP helpers, QRM planner, chirp, WAV encoder

**Files:** Create `src/audio/dsp.ts`, `dsp.test.ts`, `qrm.ts`, `qrm.test.ts`, `chirp.ts`, `chirp.test.ts`, `wav.ts`, `wav.test.ts` (all in `src/audio/`)

**Interfaces:**
- Consumes: `Rng`, `mulberry32`, `randInt` (content/rng), `KeyEvent`, `encodeTokens` (morse/encoder), `generateCallsign`, `generateContestExchange`.
- Produces:
  - `dbToGain(db: number): number`, `rms(x: ArrayLike<number>, from?: number, to?: number): number`
  - `whiteNoise(rng: Rng, n: number): Float32Array` and `pinkNoise(rng: Rng, n: number): Float32Array` — unit RMS
  - `crashBuffer(rng: Rng, sampleRate: number): Float32Array` — ~150 ms decaying burst, peak ≤ 1
  - `qsbCurve(rng: Rng, seconds: number, depthDb: number, rateHz: number, pointsPerSecond?: number): Float32Array` — gains in `[dbToGain(-depthDb), 1]`
  - `poissonTimes(rng: Rng, seconds: number, perMinute: number): number[]` — sorted, within `[0, seconds)`
  - `applyFist(events: readonly KeyEvent[], fist: { jitter: number; speedDrift: number }, rng: Rng): KeyEvent[]`
  - `interface QrmStation { offsetHz: number; wpm: number; text: string; gainDb: number; startDelay: number }`, `planQrm(rng: Rng, qrm: Conditions['qrm'], seconds: number): QrmStation[]`
  - `scheduleChirp(param: AudioParam, events: readonly KeyEvent[], base: number, pitchHz: number, chirpHz: number): void`, `driftCents(pitchHz: number, driftHz: number): number`
  - `encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer`

- [ ] **Step 1: Write failing tests**

`src/audio/dsp.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../content/rng'
import { encode } from '../morse/encoder'
import { makeTiming } from '../morse/timing'
import { applyFist, crashBuffer, dbToGain, pinkNoise, poissonTimes, qsbCurve, rms, whiteNoise } from './dsp'

const lag1 = (x: Float32Array) => {
  let num = 0
  let den = 0
  for (let k = 1; k < x.length; k++) {
    num += x[k] * x[k - 1]
    den += x[k] * x[k]
  }
  return num / den
}

describe('noise', () => {
  it('white and pink noise have unit RMS and are deterministic', () => {
    for (const gen of [whiteNoise, pinkNoise]) {
      const a = gen(mulberry32(1), 44100)
      expect(rms(a)).toBeCloseTo(1, 1)
      expect(gen(mulberry32(1), 44100)).toEqual(a)
    }
  })

  it('pink noise is smoother (more low-frequency energy) than white', () => {
    expect(lag1(pinkNoise(mulberry32(2), 44100))).toBeGreaterThan(lag1(whiteNoise(mulberry32(2), 44100)) + 0.3)
  })

  it('crash bursts decay and stay within full scale', () => {
    const c = crashBuffer(mulberry32(3), 22050)
    expect(Math.max(...c.map(Math.abs))).toBeLessThanOrEqual(1)
    expect(rms(c, 0, 300)).toBeGreaterThan(rms(c, c.length - 300))
  })
})

describe('dbToGain', () => {
  it('converts decibels to amplitude', () => {
    expect(dbToGain(0)).toBe(1)
    expect(dbToGain(-20)).toBeCloseTo(0.1)
  })
})

describe('qsbCurve', () => {
  it('stays between -depth dB and 0 dB and really fades', () => {
    const c = qsbCurve(mulberry32(4), 30, 20, 0.2)
    expect(c.length).toBe(600)
    expect(Math.min(...c)).toBeGreaterThanOrEqual(dbToGain(-20) - 1e-6)
    expect(Math.max(...c)).toBeLessThanOrEqual(1 + 1e-6)
    expect(Math.max(...c) / Math.min(...c)).toBeGreaterThan(3)
  })
})

describe('poissonTimes', () => {
  it('is sorted, in range, and near the requested rate', () => {
    const t = poissonTimes(mulberry32(5), 600, 30)
    expect(t.length).toBeGreaterThan(240)
    expect(t.length).toBeLessThan(360)
    for (let k = 1; k < t.length; k++) expect(t[k]).toBeGreaterThan(t[k - 1])
    expect(t.at(-1)!).toBeLessThan(600)
    expect(poissonTimes(mulberry32(5), 600, 0)).toEqual([])
  })
})

describe('applyFist', () => {
  const events = encode('PARIS PARIS', makeTiming({ charWpm: 20, effWpm: 20, extraWordGap: 0 })).events

  it('returns the same timing when the fist is perfect', () => {
    expect(applyFist(events, { jitter: 0, speedDrift: 0 }, mulberry32(1))).toEqual(events)
  })

  it('jitters timing but keeps order, key states, token indexes and positive durations', () => {
    const out = applyFist(events, { jitter: 0.3, speedDrift: 0.2 }, mulberry32(1))
    expect(out.map((e) => [e.down, e.i])).toEqual(events.map((e) => [e.down, e.i]))
    expect(out[0].t).toBe(events[0].t)
    for (let k = 1; k < out.length; k++) expect(out[k].t).toBeGreaterThan(out[k - 1].t)
    expect(out.some((e, k) => Math.abs(e.t - events[k].t) > 0.001)).toBe(true)
  })
})
```

`src/audio/qrm.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../content/rng'
import { isLosslessMorse } from '../content/testing'
import { planQrm } from './qrm'

describe('planQrm', () => {
  it('plans the requested stations around the signal', () => {
    const plan = planQrm(mulberry32(1), { stations: 3, levelDb: -6, maxOffsetHz: 300 }, 10)
    expect(plan).toHaveLength(3)
    for (const s of plan) {
      expect(Math.abs(s.offsetHz)).toBeGreaterThanOrEqual(50)
      expect(Math.abs(s.offsetHz)).toBeLessThanOrEqual(300)
      expect(s.wpm).toBeGreaterThanOrEqual(15)
      expect(s.wpm).toBeLessThanOrEqual(35)
      expect(s.gainDb).toBeGreaterThanOrEqual(-9)
      expect(s.gainDb).toBeLessThanOrEqual(-3)
      expect(s.startDelay).toBeGreaterThanOrEqual(0)
      expect(s.startDelay).toBeLessThanOrEqual(5)
      expect(isLosslessMorse(s.text)).toBe(true)
    }
    expect(planQrm(mulberry32(1), { stations: 0, levelDb: -6, maxOffsetHz: 300 }, 10)).toEqual([])
  })
})
```

`src/audio/chirp.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { encode } from '../morse/encoder'
import { makeTiming } from '../morse/timing'
import { driftCents, scheduleChirp } from './chirp'

describe('scheduleChirp', () => {
  const { events } = encode('EE', makeTiming({ charWpm: 20, effWpm: 20, extraWordGap: 0 }))

  it('jumps the pitch up at each key-down and glides back', () => {
    const param = { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }
    scheduleChirp(param as unknown as AudioParam, events, 1, 600, 40)
    expect(param.setValueAtTime.mock.calls).toEqual([[640, 1], [640, expect.closeTo(1.24)]])
    expect(param.setTargetAtTime.mock.calls[0]).toEqual([600, 1, expect.any(Number)])
  })

  it('does nothing without chirp', () => {
    const param = { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }
    scheduleChirp(param as unknown as AudioParam, events, 1, 600, 0)
    expect(param.setValueAtTime).not.toHaveBeenCalled()
  })
})

describe('driftCents', () => {
  it('converts a frequency offset to cents', () => {
    expect(driftCents(600, 0)).toBe(0)
    expect(driftCents(600, 600)).toBeCloseTo(1200)
  })
})
```

`src/audio/wav.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { encodeWav } from './wav'

describe('encodeWav', () => {
  it('writes a 16-bit mono PCM WAV', () => {
    const buf = encodeWav(new Float32Array([0, 1, -1, 0.5, 2]), 22050)
    const v = new DataView(buf)
    const str = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))
    expect(str(0)).toBe('RIFF')
    expect(str(8)).toBe('WAVE')
    expect(v.getUint16(22, true)).toBe(1)
    expect(v.getUint32(24, true)).toBe(22050)
    expect(v.getUint16(34, true)).toBe(16)
    expect(v.getUint32(40, true)).toBe(10)
    expect(buf.byteLength).toBe(54)
    expect([0, 1, 2, 3, 4].map((k) => v.getInt16(44 + 2 * k, true))).toEqual([0, 32767, -32768, 16384, 32767])
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/audio` — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement `src/audio/dsp.ts`**

```ts
import type { Rng } from '../content/rng'
import type { KeyEvent } from '../morse/encoder'

export const dbToGain = (db: number): number => 10 ** (db / 20)

export function rms(x: ArrayLike<number>, from = 0, to = x.length): number {
  let sum = 0
  for (let k = from; k < to; k++) sum += x[k] * x[k]
  return Math.sqrt(sum / Math.max(1, to - from))
}

function normalize(x: Float32Array): Float32Array {
  const r = rms(x)
  if (r > 0) for (let k = 0; k < x.length; k++) x[k] /= r
  return x
}

export function whiteNoise(rng: Rng, n: number): Float32Array {
  const x = new Float32Array(n)
  for (let k = 0; k < n; k++) x[k] = rng() * 2 - 1
  return normalize(x)
}

/** Paul Kellet's refined pink-noise filter over white noise. */
export function pinkNoise(rng: Rng, n: number): Float32Array {
  const x = new Float32Array(n)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let k = 0; k < n; k++) {
    const w = rng() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    x[k] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
    b6 = w * 0.115926
  }
  return normalize(x)
}

/** A static crash: ~150 ms of noise with a fast attack and exponential decay. */
export function crashBuffer(rng: Rng, sampleRate: number): Float32Array {
  const n = Math.round(sampleRate * 0.15)
  const x = new Float32Array(n)
  for (let k = 0; k < n; k++) x[k] = (rng() * 2 - 1) * Math.exp(-k / (sampleRate * 0.03))
  return x
}

/** Slow fading: two incommensurate sines → gain between -depthDb and 0 dB. */
export function qsbCurve(rng: Rng, seconds: number, depthDb: number, rateHz: number, pointsPerSecond = 20): Float32Array {
  const n = Math.max(2, Math.ceil(seconds * pointsPerSecond))
  const p1 = rng() * 2 * Math.PI
  const p2 = rng() * 2 * Math.PI
  const out = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    const t = k / pointsPerSecond
    const s = 0.6 * Math.sin(2 * Math.PI * rateHz * t + p1) + 0.4 * Math.sin(2 * Math.PI * rateHz * 1.73 * t + p2)
    out[k] = dbToGain((-depthDb * (1 - s)) / 2)
  }
  return out
}

/** Event times of a Poisson process (e.g. static crashes). */
export function poissonTimes(rng: Rng, seconds: number, perMinute: number): number[] {
  if (perMinute <= 0) return []
  const rate = perMinute / 60
  const times: number[] = []
  let t = -Math.log(1 - rng()) / rate
  while (t < seconds) {
    times.push(t)
    t += -Math.log(1 - rng()) / rate
  }
  return times
}

/** Human sending: random per-element timing error plus a gradual speed drift. */
export function applyFist(events: readonly KeyEvent[], fist: { jitter: number; speedDrift: number }, rng: Rng): KeyEvent[] {
  if (events.length === 0 || (fist.jitter === 0 && fist.speedDrift === 0)) return events.map((e) => ({ ...e }))
  const direction = rng() < 0.5 ? -1 : 1
  const out: KeyEvent[] = [{ ...events[0] }]
  for (let k = 1; k < events.length; k++) {
    const d = events[k].t - events[k - 1].t
    const progress = k / (events.length - 1)
    const drift = 1 + direction * fist.speedDrift * progress
    const jitter = 1 + fist.jitter * (rng() * 2 - 1)
    out.push({ ...events[k], t: out[k - 1].t + Math.max(0.2 * d, d * jitter * drift) })
  }
  return out
}
```

- [ ] **Step 4: Implement `src/audio/qrm.ts`**

```ts
import { generateCallsign } from '../content/generators/callsigns'
import { generateContestExchange } from '../content/generators/numbers'
import { randInt, type Rng } from '../content/rng'
import type { Conditions } from './conditions'

export interface QrmStation {
  offsetHz: number
  wpm: number
  text: string
  gainDb: number
  startDelay: number
}

/** Other stations near our frequency, each sending its own traffic. */
export function planQrm(rng: Rng, qrm: Conditions['qrm'], seconds: number): QrmStation[] {
  return Array.from({ length: qrm.stations }, () => {
    const call = generateCallsign(rng, false)
    return {
      offsetHz: (50 + rng() * (qrm.maxOffsetHz - 50)) * (rng() < 0.5 ? -1 : 1),
      wpm: randInt(rng, 15, 35),
      text: rng() < 0.5 ? `CQ CQ DE ${call} ${call} K` : `${generateContestExchange(rng)} ${generateContestExchange(rng)}`,
      gainDb: qrm.levelDb + (rng() * 6 - 3),
      startDelay: rng() * seconds * 0.5,
    }
  })
}
```

- [ ] **Step 5: Implement `src/audio/chirp.ts`**

```ts
import type { KeyEvent } from '../morse/encoder'

const CHIRP_TIME_CONSTANT = 0.01

/** Transmitter chirp: pitch jumps up at each key-down and settles back within ~30 ms. */
export function scheduleChirp(param: AudioParam, events: readonly KeyEvent[], base: number, pitchHz: number, chirpHz: number): void {
  if (chirpHz <= 0) return
  for (const e of events) {
    if (!e.down) continue
    param.setValueAtTime(pitchHz + chirpHz, base + e.t)
    param.setTargetAtTime(pitchHz, base + e.t, CHIRP_TIME_CONSTANT)
  }
}

/** Pitch drift expressed as oscillator detune. */
export function driftCents(pitchHz: number, driftHz: number): number {
  return 1200 * Math.log2((pitchHz + driftHz) / pitchHz)
}
```

- [ ] **Step 6: Implement `src/audio/wav.ts`**

```ts
/** 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const text = (o: number, s: string) => [...s].forEach((c, k) => v.setUint8(o + k, c.charCodeAt(0)))
  text(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  text(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  samples.forEach((s, k) => {
    const c = Math.max(-1, Math.min(1, s))
    v.setInt16(44 + 2 * k, c < 0 ? Math.round(c * 32768) : Math.round(c * 32767), true)
  })
  return buf
}
```

- [ ] **Step 7: Run** `npx vitest run src/audio` — Expected: PASS.

- [ ] **Step 8: Commit** — `git add src/audio && git commit -m "feat(audio): seeded noise, fading, crashes, fist, QRM planner, chirp and WAV encoder" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 3: Audio graph, engine integration, WAV rendering

**Files:** Create `src/audio/graph.ts`, `src/audio/render.ts`; Modify `src/audio/engine.ts`

**Interfaces:**
- Consumes: Tasks 1–2, `planReschedule`, `scheduleEnvelope`, `fadeOutAndStop`, `encodeTokens`, `encode`, `makeTiming`, `tokenize`, `mulberry32`.
- Produces:
  - `interface GraphOptions { text: string; timing: Timing; pitchHz: number; volume: number; conditions: Conditions; seed: number }`
  - `interface Graph { master: GainNode; stop(when: number): void; retime(timing: Timing, cutoff: number): void; onEnded(cb: () => void): void; dispose(): void }`
  - `buildGraph(ctx: BaseAudioContext, destination: AudioNode, o: GraphOptions, start: number): Graph`
  - `renderWav(o: GraphOptions): Promise<Blob>` (`render.ts`)
  - `PlayOptions` = `GraphOptions & { onEnd?: () => void }` (engine)

- [ ] **Step 1: Implement `src/audio/graph.ts`**

```ts
import { mulberry32 } from '../content/rng'
import { encode, encodeTokens, type KeyEvent } from '../morse/encoder'
import { tokenize } from '../morse/table'
import { makeTiming, type Timing } from '../morse/timing'
import { driftCents, scheduleChirp } from './chirp'
import type { Conditions } from './conditions'
import { applyFist, crashBuffer, dbToGain, pinkNoise, poissonTimes, qsbCurve, whiteNoise } from './dsp'
import { scheduleEnvelope } from './envelope'
import { planQrm } from './qrm'
import { planReschedule } from './reschedule'

export interface GraphOptions {
  text: string
  timing: Timing
  pitchHz: number
  volume: number
  conditions: Conditions
  /** Seeds every random impairment, so a repeat sounds identical. */
  seed: number
}

export interface Graph {
  master: GainNode
  stop(when: number): void
  retime(timing: Timing, cutoff: number): void
  onEnded(cb: () => void): void
  dispose(): void
}

const TAIL = 0.05
/** RMS of a full-scale sine: the reference for SNR. */
const SIGNAL_RMS = Math.SQRT1_2
/** Headroom so signal + noise + QRM + QRN rarely clip. */
const MIX_GAIN = 0.5

export function buildGraph(ctx: BaseAudioContext, destination: AudioNode, o: GraphOptions, start: number): Graph {
  const rng = mulberry32((o.seed ^ 0x5bd1e995) >>> 0)
  const c = o.conditions
  const tokens = tokenize(o.text)
  const nodes: AudioNode[] = []
  const sources: AudioScheduledSourceNode[] = []
  const track = <T extends AudioNode>(n: T): T => {
    nodes.push(n)
    return n
  }

  const master = track(ctx.createGain())
  master.gain.value = o.volume
  master.connect(destination)
  const mix = track(ctx.createGain())
  mix.gain.value = MIX_GAIN
  if (c.bandwidthHz > 0) {
    const bp = track(ctx.createBiquadFilter())
    bp.type = 'bandpass'
    bp.frequency.value = o.pitchHz
    bp.Q.value = o.pitchHz / c.bandwidthHz
    mix.connect(bp).connect(master)
  } else {
    mix.connect(master)
  }

  // Wanted signal: oscillator → keying envelope → QSB fading → mix.
  const osc = track(ctx.createOscillator())
  osc.frequency.value = o.pitchHz
  const envelope = track(ctx.createGain())
  envelope.gain.value = 0
  const fading = track(ctx.createGain())
  osc.connect(envelope).connect(fading).connect(mix)

  const events = applyFist(encodeTokens(tokens, o.timing).events, c.fist, rng)
  let duration = events.at(-1)?.t ?? 0
  let scheduled: KeyEvent[] = events.map((e) => ({ ...e, t: e.t + start }))
  scheduleEnvelope(envelope.gain, events, start)
  scheduleChirp(osc.frequency, events, start, o.pitchHz, c.fist.chirpHz)

  // Background impairments cover twice the item length, so slowing down mid-item stays covered.
  const cover = duration * 2 + 10
  const backgroundStart = Math.max(ctx.currentTime, start - 0.25)
  if (c.fist.driftHz > 0) {
    osc.detune.setValueAtTime(0, start)
    osc.detune.linearRampToValueAtTime(driftCents(o.pitchHz, c.fist.driftHz), start + cover)
  }
  if (c.qsb.depthDb > 0) fading.gain.setValueCurveAtTime(qsbCurve(rng, cover, c.qsb.depthDb, c.qsb.rateHz), start, cover)

  if (c.noise.type !== 'off') {
    const n = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate)
    buffer.copyToChannel(c.noise.type === 'white' ? whiteNoise(rng, n) : pinkNoise(rng, n), 0)
    const src = track(ctx.createBufferSource())
    src.buffer = buffer
    src.loop = true
    const gain = track(ctx.createGain())
    gain.gain.value = SIGNAL_RMS * dbToGain(-c.noise.snrDb)
    src.connect(gain).connect(mix)
    src.start(backgroundStart)
    sources.push(src)
  }

  if (c.qrn.perMinute > 0) {
    const crash = crashBuffer(rng, ctx.sampleRate)
    const buffer = ctx.createBuffer(1, crash.length, ctx.sampleRate)
    buffer.copyToChannel(crash, 0)
    const gain = track(ctx.createGain())
    gain.gain.value = dbToGain(c.qrn.levelDb)
    gain.connect(mix)
    for (const t of poissonTimes(rng, cover, c.qrn.perMinute)) {
      const src = track(ctx.createBufferSource())
      src.buffer = buffer
      src.connect(gain)
      src.start(backgroundStart + t)
      sources.push(src)
    }
  }

  for (const station of planQrm(rng, c.qrm, duration)) {
    const qosc = track(ctx.createOscillator())
    qosc.frequency.value = o.pitchHz + station.offsetHz
    const qenv = track(ctx.createGain())
    qenv.gain.value = 0
    const qgain = track(ctx.createGain())
    qgain.gain.value = dbToGain(station.gainDb)
    qosc.connect(qenv).connect(qgain).connect(mix)
    const qt = makeTiming({ charWpm: station.wpm, effWpm: station.wpm, extraWordGap: 0 })
    scheduleEnvelope(qenv.gain, encode(station.text, qt).events, start + station.startDelay)
    qosc.start(start)
    sources.push(qosc)
  }

  osc.start(start)
  sources.push(osc)
  const stop = (when: number) => sources.forEach((s) => s.stop(when))
  stop(start + duration + TAIL)

  return {
    master,
    stop,
    onEnded(cb) {
      osc.onended = cb
    },
    dispose() {
      nodes.forEach((n) => n.disconnect())
    },
    retime(timing, cutoff) {
      const plan = planReschedule(scheduled, tokens, timing, cutoff)
      if (!plan) return
      const { keep, fromToken, at } = plan
      const rest = applyFist(encodeTokens(tokens.slice(fromToken), timing).events, c.fist, rng)
      const from = Math.min(at, scheduled[keep].t)
      envelope.gain.cancelScheduledValues(from)
      scheduleEnvelope(envelope.gain, rest, at)
      if (c.fist.chirpHz > 0) {
        osc.frequency.cancelScheduledValues(from)
        osc.frequency.setValueAtTime(o.pitchHz, from)
        scheduleChirp(osc.frequency, rest, at, o.pitchHz, c.fist.chirpHz)
      }
      scheduled = [...scheduled.slice(0, keep), ...rest.map((e) => ({ ...e, i: e.i + fromToken, t: e.t + at }))]
      duration = (rest.at(-1)?.t ?? 0) + at - start
      stop(start + duration + TAIL)
    },
  }
}
```

- [ ] **Step 2: Implement `src/audio/render.ts`**

```ts
import { encodeTokens } from '../morse/encoder'
import { tokenize } from '../morse/table'
import { buildGraph, type GraphOptions } from './graph'
import { encodeWav } from './wav'

const SAMPLE_RATE = 22050
const LEAD = 0.3

/** Renders an exercise (with all impairments) offline to a WAV file. */
export async function renderWav(o: GraphOptions): Promise<Blob> {
  const clean = encodeTokens(tokenize(o.text), o.timing).duration
  const f = o.conditions.fist
  const seconds = LEAD + clean * (1 + f.jitter) * (1 + f.speedDrift) + LEAD
  const ctx = new OfflineAudioContext(1, Math.ceil(SAMPLE_RATE * seconds), SAMPLE_RATE)
  buildGraph(ctx, ctx.destination, o, LEAD)
  const audio = await ctx.startRendering()
  return new Blob([encodeWav(audio.getChannelData(0), SAMPLE_RATE)], { type: 'audio/wav' })
}
```

- [ ] **Step 3: Replace `startPlayback` in `src/audio/engine.ts`**

Replace the imports and everything from `export interface PlayOptions` to the end with:
```ts
import type { Timing } from '../morse/timing'
import { fadeOutAndStop } from './fade'
import { buildGraph, type GraphOptions } from './graph'

export interface PlayOptions extends GraphOptions {
  /** Called once when playback ends, whether it finished or was stopped. */
  onEnd?: () => void
}
```
keep `PlaybackHandle`, `START_DELAY`, `RESCHEDULE_MARGIN`, `MorseEngine`, `engine` unchanged (delete the old `TAIL` constant and the old imports of `encodeTokens`, `KeyEvent`, `tokenize`, `scheduleEnvelope`, `planReschedule`), and replace `startPlayback` with:
```ts
function startPlayback(ctx: AudioContext, opts: PlayOptions): PlaybackHandle {
  const graph = buildGraph(ctx, ctx.destination, opts, ctx.currentTime + START_DELAY)
  let playing = true
  let stopping = false
  graph.onEnded(() => {
    playing = false
    graph.dispose()
    opts.onEnd?.()
  })
  return {
    isPlaying: () => playing,
    stop() {
      if (!playing || stopping) return
      stopping = true
      fadeOutAndStop(graph.master.gain, graph, ctx.currentTime)
    },
    setTiming(timing: Timing) {
      // A re-time would push stop() past the fade-out, so ignore it once stopping.
      if (!playing || stopping) return
      graph.retime(timing, ctx.currentTime + RESCHEDULE_MARGIN)
    },
  }
}
```

- [ ] **Step 4: Typecheck** — `npm run typecheck`. Expected: errors only in `src/ui/pages/Receive.tsx` (missing `conditions`/`seed`), fixed in Task 6. Run `npx vitest run` — Expected: PASS.

- [ ] **Step 5: Commit** — `git add src/audio && git commit -m "feat(audio): shared audio graph with all impairments, offline WAV rendering" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 4: (folded into Task 3 — graph and engine are verified together by Task 6 e2e)

---

### Task 5: Settings v3 — conditions and preset

**Files:** Modify `src/store/settings.ts`, `src/store/settings.test.ts`

**Interfaces:**
- Consumes: `Conditions`, `PRESETS`, `PresetName`, `isPresetName`, `normalizeConditions` (Task 1); `getLevel` (difficulty).
- Produces: `Settings.schemaVersion: 3`, `Settings.conditionsPreset: PresetName | 'custom'`, `Settings.conditions: Conditions`; `applyLevel` also applies the level's preset; `setConditionsPreset(s, name: PresetName): Settings`; `setConditions(s, c: Conditions): Settings` (→ `'custom'`).

- [ ] **Step 1: Update tests** — in `src/store/settings.test.ts` change the two `schemaVersion: 2` expectations in `describe('settings v2')` to `schemaVersion: 3`, add `setConditions, setConditionsPreset` to the import, add `import { PRESETS } from '../audio/conditions'`, and append:
```ts
describe('settings v3 conditions', () => {
  it('defaults to clean conditions', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ schemaVersion: 3, conditionsPreset: 'clean', conditions: PRESETS.clean })
  })

  it('migrates older records with the preset of their level', () => {
    const s = migrateSettings({ schemaVersion: 2, level: 4, content: 'words', charWpm: 25, effWpm: 25, linkSpeeds: true, extraWordGap: 0, pitchHz: 600, volume: 0.5 })
    expect(s).toMatchObject({ schemaVersion: 3, content: 'words', conditionsPreset: 'moderate', conditions: PRESETS.moderate })
    expect(migrateSettings({ schemaVersion: 1, level: 'custom' }).conditionsPreset).toBe('clean')
  })

  it('keeps stored custom conditions, clamped', () => {
    const s = migrateSettings({ ...DEFAULT_SETTINGS, conditionsPreset: 'custom', conditions: { ...PRESETS.poor, noise: { type: 'white', snrDb: 99 } } })
    expect(s.conditionsPreset).toBe('custom')
    expect(s.conditions.noise).toEqual({ type: 'white', snrDb: 30 })
  })

  it('applyLevel applies the level preset', () => {
    expect(applyLevel(DEFAULT_SETTINGS, 6)).toMatchObject({ conditionsPreset: 'contest', conditions: PRESETS.contest })
    expect(applyLevel(DEFAULT_SETTINGS, 5)).toMatchObject({ conditionsPreset: 'poor' })
  })

  it('choosing a preset or editing conditions', () => {
    expect(setConditionsPreset(DEFAULT_SETTINGS, 'weak-dx')).toMatchObject({ conditionsPreset: 'weak-dx', conditions: PRESETS['weak-dx'] })
    const edited = setConditions(DEFAULT_SETTINGS, { ...PRESETS.clean, bandwidthHz: 500 })
    expect(edited).toMatchObject({ conditionsPreset: 'custom', conditions: { bandwidthHz: 500 } })
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/store` — Expected: FAIL.

- [ ] **Step 3: Update `src/store/settings.ts`**

- Add `import { isPresetName, normalizeConditions, PRESETS, type Conditions, type PresetName } from '../audio/conditions'`.
- `Settings`: `schemaVersion: 3`; add after `content`: `conditionsPreset: PresetName | 'custom'` and `conditions: Conditions`.
- `DEFAULT_SETTINGS`: `schemaVersion: 3`, `conditionsPreset: 'clean'`, `conditions: PRESETS.clean`.
- Add helper:
```ts
const presetForLevel = (level: Settings['level']): PresetName => (level === 'custom' ? 'clean' : getLevel(level).conditions)
```
- `migrateSettings`: accept `schemaVersion` 1, 2 or 3; compute `level` first into a const, then in the returned object use `schemaVersion: 3` and add:
```ts
    ...(r.conditionsPreset === 'custom' || isPresetName(r.conditionsPreset)
      ? { conditionsPreset: r.conditionsPreset, conditions: r.conditionsPreset === 'custom' ? normalizeConditions(r.conditions) : PRESETS[r.conditionsPreset] }
      : { conditionsPreset: presetForLevel(level), conditions: PRESETS[presetForLevel(level)] }),
```
- `applyLevel`: add `conditionsPreset: p.conditions, conditions: PRESETS[p.conditions]` to the object passed to `normalizeSettings`.
- Add:
```ts
export function setConditionsPreset(s: Settings, name: PresetName): Settings {
  return { ...s, conditionsPreset: name, conditions: PRESETS[name] }
}

export function setConditions(s: Settings, conditions: Conditions): Settings {
  return { ...s, conditionsPreset: 'custom', conditions: normalizeConditions(conditions) }
}
```

- [ ] **Step 4: Run** `npx vitest run src/store src/training` — Expected: PASS.

- [ ] **Step 5: Commit** — `git add src/store && git commit -m "feat(store): settings v3 with band conditions and presets" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 6: Conditions panel, WAV download, e2e

**Files:** Create `src/ui/Slider.tsx`, `src/ui/ConditionsPanel.tsx`, `e2e/impairments.spec.ts`; Modify `src/ui/pages/Receive.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `setConditions`, `setConditionsPreset`, `PRESET_NAMES`, `PRESET_LABELS`, `BANDWIDTHS`, `renderWav`, engine `PlayOptions`.
- Produces: select "Band conditions"; `<details>` "Adjust conditions" with labelled controls (e.g. "Signal-to-noise (dB)"); button "Download WAV".

- [ ] **Step 1: Write e2e tests** — `e2e/impairments.spec.ts`

```ts
import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  return errors
}

async function setup(page: Page, preset: string) {
  await page.goto('/#/receive')
  await page.getByLabel('Difficulty level').selectOption('6')
  await page.getByLabel('Content type').selectOption('groups')
  await page.getByLabel('Band conditions').selectOption(preset)
}

async function downloadSamples(page: Page): Promise<{ bytes: Buffer; samples: Int16Array }> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download WAV' }).click()])
  const bytes = await readFile((await download.path())!)
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF')
  const samples = new Int16Array(bytes.buffer.slice(bytes.byteOffset + 44, bytes.byteOffset + bytes.length))
  return { bytes, samples }
}

const rms = (x: Int16Array, from: number, to: number) => {
  let s = 0
  for (let k = from; k < to; k++) s += (x[k] / 32768) ** 2
  return Math.sqrt(s / (to - from))
}

test('poor conditions play to the end, even with a speed change mid-item', async ({ page }) => {
  const errors = collectErrors(page)
  await setup(page, 'poor')
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByRole('status')).toHaveText('Playing…')
  await page.getByRole('button', { name: 'Faster' }).click()
  await expect(page.getByRole('status')).toHaveText('Finished', { timeout: 30_000 })
  expect(errors).toEqual([])
})

test('WAV export: clean is silent before the signal, noisy is not, and repeats are identical', async ({ page }) => {
  await setup(page, 'clean')
  await page.getByRole('button', { name: 'Play' }).click()
  const clean = await downloadSamples(page)
  const lead = 22050 * 0.25
  expect(rms(clean.samples, 0, lead)).toBeLessThan(0.001)

  await page.getByLabel('Band conditions').selectOption('poor')
  const noisy = await downloadSamples(page)
  expect(rms(noisy.samples, 0, lead)).toBeGreaterThan(0.02)
  let peak = 0
  for (const v of noisy.samples) peak = Math.max(peak, Math.abs(v))
  expect(peak).toBeLessThan(32767)

  const again = await downloadSamples(page)
  expect(again.bytes.equals(noisy.bytes)).toBe(true)
})

test('band conditions follow the level, go custom when adjusted, and persist', async ({ page }) => {
  await page.goto('/#/receive')
  await page.getByLabel('Difficulty level').selectOption('1')
  await expect(page.getByLabel('Band conditions')).toHaveValue('clean')
  await page.getByLabel('Difficulty level').selectOption('4')
  await expect(page.getByLabel('Band conditions')).toHaveValue('moderate')
  await page.getByText('Adjust conditions').click()
  // Range inputs can't be filled; drive the slider with the keyboard: Home = -10, then +12 steps.
  const snr = page.getByLabel('Signal-to-noise (dB)')
  await snr.focus()
  await snr.press('Home')
  for (let k = 0; k < 12; k++) await snr.press('ArrowRight')
  await expect(page.getByLabel('Band conditions')).toHaveValue('custom')
  await page.reload()
  await expect(page.getByLabel('Band conditions')).toHaveValue('custom')
  await page.getByText('Adjust conditions').click()
  await expect(page.getByLabel('Signal-to-noise (dB)')).toHaveValue('2')
})
```

- [ ] **Step 2: Run** `npm run test:e2e` — Expected: FAIL (build errors / missing controls).

- [ ] **Step 3: Create `src/ui/Slider.tsx`**

```tsx
interface Props {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
}

export function Slider({ label, value, min, max, step, format = String, onChange }: Props) {
  return (
    <label className="slider">
      <span>
        {label} <output>{format(value)}</output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </label>
  )
}
```

- [ ] **Step 4: Create `src/ui/ConditionsPanel.tsx`**

```tsx
import { BANDWIDTHS, PRESET_LABELS, PRESET_NAMES, type Conditions, type NoiseType, type PresetName } from '../audio/conditions'
import { setConditions, setConditionsPreset, type Settings } from '../store/settings'
import type { UpdateSettings } from '../store/useSettings'
import { Slider } from './Slider'

const pct = (v: number) => `${Math.round(v * 100)}%`

export function ConditionsPanel({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  const c = settings.conditions
  const edit = (patch: (c: Conditions) => Conditions) => update((s) => setConditions(s, patch(s.conditions)))

  return (
    <section className="conditions" aria-label="Band conditions">
      <label className="field">
        <span>Band conditions</span>
        <select
          aria-label="Band conditions"
          value={settings.conditionsPreset}
          onChange={(e) => {
            if (e.target.value !== 'custom') update((s) => setConditionsPreset(s, e.target.value as PresetName))
          }}
        >
          {PRESET_NAMES.map((p) => (
            <option key={p} value={p}>
              {PRESET_LABELS[p]}
            </option>
          ))}
          <option value="custom" disabled={settings.conditionsPreset !== 'custom'}>
            Custom
          </option>
        </select>
      </label>

      <details>
        <summary>Adjust conditions</summary>
        <div className="conditions-grid">
          <label className="field">
            <span>Noise</span>
            <select
              aria-label="Noise type"
              value={c.noise.type}
              onChange={(e) => edit((c) => ({ ...c, noise: { ...c.noise, type: e.target.value as NoiseType } }))}
            >
              <option value="off">Off</option>
              <option value="white">White</option>
              <option value="pink">Pink</option>
            </select>
          </label>
          <Slider label="Signal-to-noise (dB)" min={-10} max={30} step={1} value={c.noise.snrDb}
            onChange={(v) => edit((c) => ({ ...c, noise: { ...c.noise, snrDb: v } }))} />
          <label className="field">
            <span>Receiver filter</span>
            <select
              aria-label="Receiver bandwidth"
              value={c.bandwidthHz}
              onChange={(e) => edit((c) => ({ ...c, bandwidthHz: Number(e.target.value) as Conditions['bandwidthHz'] }))}
            >
              {BANDWIDTHS.map((b) => (
                <option key={b} value={b}>
                  {b === 0 ? 'Off' : `${b} Hz`}
                </option>
              ))}
            </select>
          </label>
          <Slider label="Fading depth (dB)" min={0} max={30} step={1} value={c.qsb.depthDb}
            onChange={(v) => edit((c) => ({ ...c, qsb: { ...c.qsb, depthDb: v } }))} />
          <Slider label="Fading speed (Hz)" min={0.05} max={0.5} step={0.05} value={c.qsb.rateHz}
            onChange={(v) => edit((c) => ({ ...c, qsb: { ...c.qsb, rateHz: v } }))} />
          <Slider label="Interfering stations" min={0} max={3} step={1} value={c.qrm.stations}
            onChange={(v) => edit((c) => ({ ...c, qrm: { ...c.qrm, stations: v } }))} />
          <Slider label="Interference level (dB)" min={-30} max={6} step={1} value={c.qrm.levelDb}
            onChange={(v) => edit((c) => ({ ...c, qrm: { ...c.qrm, levelDb: v } }))} />
          <Slider label="Static crashes per minute" min={0} max={60} step={1} value={c.qrn.perMinute}
            onChange={(v) => edit((c) => ({ ...c, qrn: { ...c.qrn, perMinute: v } }))} />
          <Slider label="Static level (dB)" min={-30} max={6} step={1} value={c.qrn.levelDb}
            onChange={(v) => edit((c) => ({ ...c, qrn: { ...c.qrn, levelDb: v } }))} />
          <Slider label="Timing jitter" min={0} max={0.3} step={0.01} value={c.fist.jitter} format={pct}
            onChange={(v) => edit((c) => ({ ...c, fist: { ...c.fist, jitter: v } }))} />
          <Slider label="Speed drift" min={0} max={0.2} step={0.01} value={c.fist.speedDrift} format={pct}
            onChange={(v) => edit((c) => ({ ...c, fist: { ...c.fist, speedDrift: v } }))} />
          <Slider label="Chirp (Hz)" min={0} max={100} step={5} value={c.fist.chirpHz}
            onChange={(v) => edit((c) => ({ ...c, fist: { ...c.fist, chirpHz: v } }))} />
          <Slider label="Pitch drift (Hz)" min={0} max={50} step={1} value={c.fist.driftHz}
            onChange={(v) => edit((c) => ({ ...c, fist: { ...c.fist, driftHz: v } }))} />
        </div>
      </details>
    </section>
  )
}
```

- [ ] **Step 5: Wire into `src/ui/pages/Receive.tsx`**

- Import `ConditionsPanel` and `renderWav` (`../../audio/render`).
- In `play`, pass `conditions: settings.conditions, seed: it.seed` to `engine.play`.
- Render `<ConditionsPanel settings={settings} update={update} />` right after `<SpeedBar …/>`.
- Add to the controls after the Stop button:
```tsx
        <button type="button" onClick={() => void downloadWav()} disabled={!item}>
          Download WAV
        </button>
```
- Add, before `return`:
```tsx
  const downloadWav = async () => {
    if (!item) return
    try {
      const blob = await renderWav({
        text: item.text,
        timing: makeTiming(settings),
        pitchHz: settings.pitchHz,
        volume: settings.volume,
        conditions: settings.conditions,
        seed: item.seed,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cw-${item.kind}-${item.seed}.wav`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      setError("Couldn't create the WAV file in this browser.")
    }
  }
```

- [ ] **Step 6: Append styles to `src/index.css`**
```css
.conditions { padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 1.5rem; }
.conditions details { margin-top: 0.8rem; }
.conditions summary { cursor: pointer; color: var(--accent); }
.conditions-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.9rem 1.2rem; margin-top: 0.8rem; }
.slider { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; color: var(--muted); }
.slider output { color: var(--text); font-variant-numeric: tabular-nums; }
.slider input { padding: 0; accent-color: var(--accent); }
```

- [ ] **Step 7: Run everything** — `npm run lint && npm run typecheck && npm test && npm run test:e2e` — Expected: all green (e2e 11 passed).

- [ ] **Step 8: Commit** — `git add src e2e && git commit -m "feat(ui): band conditions panel and WAV download" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`
