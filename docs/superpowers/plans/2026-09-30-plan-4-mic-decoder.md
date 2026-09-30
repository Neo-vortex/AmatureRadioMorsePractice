# Plan 4 — Live Microphone Decoder

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `#/decode` page that listens to the microphone and writes the Morse it hears, live (≤ 3 s delay), with two engines: ggmorse (default) and DeepCW (optional).

**Architecture:** Mic → Web Audio (optional bandpass) → AudioWorklet tap → MessagePort → engine Web Worker → `DecoderUpdate` messages → React page. Each engine is a framework-free class (`GgmorseEngine`, `DeepCwEngine`) tested in Node with synthetic CW; the workers are thin shells around them.

**Tech Stack:** ggmorse (C++ → WASM via Emscripten 4.0.15 in Docker, single-file ES module), onnxruntime-web 1.24.3 (WASM, 1 thread), existing React/Vite/Vitest/Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-mic-decoder-design.md`

## Global Constraints

- Delay from a word's end to it appearing on screen: ≤ 3 s.
- Browser mic processing off: `echoCancellation`, `noiseSuppression`, `autoGainControl` = false.
- ggmorse output passes a squelch: tone peak ≥ 17 dB over the in-band median, 4 s hold, closes immediately on a ggmorse pitch jump (`'\n'`) with no tone in the last 0.5 s. (Measured 2026-09-30: noise peaks ≈ 12 dB, CW at 0 dB SNR ≈ 25 dB; without squelch ggmorse invents text from noise.)
- DeepCW: 3200 Hz, 256-pt FFT, hop 48, periodic Hann, reflect pad 128, bins 32…96 (400–1200 Hz), `log1p(|X|)`; output is 1 frame per input frame; greedy CTC, blank = 41. Rolling buffer ≤ 10 s, re-decode when ≥ 0.25 s new audio, tail guard 1.25 s, pad to ≥ 2 s (pad length a multiple of the hop).
- Project license AGPL-3.0-only; ggmorse MIT and DeepCW AGPL-3.0 license files kept next to their code/model.
- `erasableSyntaxOnly` is on: no constructor parameter properties, no enums.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Noise only / signal stops** — ggmorse must not print garbage (pinned: Task 3 squelch tests, Task 4 "noise alone produces no text").
2. **Microphone permission denied / no device / insecure page** — readable alert, Start usable again (pinned: Task 7 `micErrorMessage` tests, Task 9 e2e).
3. **DeepCW model or runtime fails to load** — worker reports an error, page shows it and returns to idle (pinned: Task 6 worker catch → `error`; Task 8 page handler).
4. **Switching engine while listening** — old worker terminated, new one fed from a fresh port, text kept (pinned: Task 8 `runEngine`; e2e runs each engine).
5. **Browser sample rates other than 48 kHz** (44.1 kHz, 16 kHz Bluetooth) — both engines accept any rate (pinned: Task 4 test at 44.1 kHz; Task 5 resampler test at 44.1 kHz).

---

## File Structure

```
LICENSE                                  AGPL-3.0 text
vendor/ggmorse/                          upstream 7b4822a (MIT): include/, src/, LICENSE
wasm/ggmorse/wrapper.cpp                 push-based C API
wasm/ggmorse/build.sh                    Docker emscripten build → src/decoder/ggmorse/ggmorse.mjs
public/models/deepcw/                    model.onnx, model.onnx.json, LICENSE, README.md
src/decoder/types.ts                     EngineName, DecoderUpdate, EngineIn, EngineOut
src/decoder/fft.ts                       powerSpectrum (radix-2)
src/decoder/squelch.ts                   Squelch
src/decoder/settings.ts                  DecoderSettings, normalizeDecoderSettings
src/decoder/mic.ts                       openMic, listMics, micErrorMessage
src/decoder/capture.ts                   Capture (AudioContext graph, filter, tap port)
src/decoder/micTap.worklet.ts            AudioWorkletProcessor 'mic-tap'
src/decoder/audioworklet.d.ts            AudioWorklet global types
src/decoder/engines.ts                   startEngine(name, capture, onMessage)
src/decoder/ggmorse/{engine,worker}.ts   GgmorseEngine + worker; ggmorse.mjs/.d.mts
src/decoder/deepcw/{metadata,resample,spectrogram,ctc,stream,engine,worker}.ts
src/decoder/testing/{synth,cer}.ts       synthetic CW + noise; character error rate
src/store/settings.ts                    schemaVersion 4, decoder field, setDecoder
src/ui/Waterfall.tsx, src/ui/pages/Decode.tsx, src/App.tsx, src/ui/pages/Home.tsx, src/index.css
e2e/fixtures/fakeMic.ts, e2e/decode.spec.ts, e2e/decode-errors.spec.ts, playwright.config.ts
```

## Tasks

### Task 1: License and credits
- [x] Add `LICENSE` (AGPL-3.0 text from gnu.org), `"license": "AGPL-3.0-only"` in package.json, README "Credits" + "License" sections, footer link to the source repository.
- [x] `npm run lint && npm run typecheck`; commit.

### Task 2: Test helpers — synthetic CW and CER
- **Produces:** `synthCw({ text, wpm, snrDb, sampleRate, pitchHz?=650, lead?=2, tail?=4, seed?=1 }) → { audio, charEnds: {char,t}[], end }` (SNR in 2500 Hz; `Infinity` = no noise; keying from `encode()`), `charErrorRate(expected, actual)` (Levenshtein / expected length).
- [x] Tests: charEnds for `AB C` are A,B,C increasing; clean synth is silent before `lead`; same seed → same audio; CER of identical = 0, one substitution in 4 = 0.25.
- [x] Implement; run; commit.

### Task 3: FFT and squelch
- **Produces:** `powerSpectrum(frame: ArrayLike<number>): Float64Array` (n/2+1 bins, n power of two); `class Squelch { constructor(sampleRate, options?) push(samples) pitchLost() isOpen() toneDb() time }`, `SQUELCH_DEFAULTS = { thresholdDb: 17, holdSeconds: 4, minHz: 300, maxHz: 1200 }`.
- [x] Tests: FFT equals naive DFT (n=256, random) to 1e-9 relative; sine peaks at its bin; squelch never opens on 10 s of noise (snr irrelevant, text ''); opens during CW at 0 dB; closes `holdSeconds` after the signal; `pitchLost()` closes it once no tone for 0.5 s.
- [x] Implement; run; commit.

### Task 4: ggmorse WASM + GgmorseEngine + worker
- [x] Vendor ggmorse 7b4822a (`include/`, `src/*.cpp|h`, LICENSE, `VERSION`); `wasm/ggmorse/wrapper.cpp` (gm_create/gm_input/gm_push/gm_take_text/gm_pitch/gm_wpm/gm_destroy — queue samples, feed ggmorse exact frame sizes via its pull callback); `wasm/ggmorse/build.sh` (docker `emscripten/emsdk:4.0.15`, `-O3 -sMODULARIZE -sEXPORT_ES6 -sSINGLE_FILE -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH -sFILESYSTEM=0`, exports + `HEAPF32,UTF8ToString`); `npm run wasm:build`; commit output `src/decoder/ggmorse/ggmorse.mjs` + `ggmorse.d.mts`; oxlint ignores `vendor`, `ggmorse.mjs`.
- **Produces:** `types.ts`; `class GgmorseEngine { constructor(module: GgmorseModule, sampleRate) push(samples) take(): DecoderUpdate destroy() }` (squelch gates text, collapses spaces, `'\n'` → space; pitch/wpm null while squelched); `ggmorse/worker.ts` posts `ready`, then `update` every 100 ms.
- [x] Tests (Node, 20 ms chunks): 48 kHz 20 WPM and 30 WPM at 0 dB contain `DL1ABC DL1ABC K` and CER ≤ 0.15; 44.1 kHz 20 WPM 6 dB same; 10 s noise → `''`; `K` appears < 3 s after its end.
- [x] Implement; run; commit.

### Task 5: DeepCW signal chain
- **Produces:** `DeepCwMeta`, `binRange(meta)`, `validateMeta(raw)`; `class Resampler { constructor(inRate, outRate) push(input): Float32Array }` (Hamming windowed-sinc, cutoff 0.45·out, evaluated only at output points, linear interpolation between filtered neighbours); `spectrogram(audio, meta) → { data, frames, bins }`; `greedyCtc(logProbs, frames, classes, chars, blank) → Span[]` with `{ char, startFrame, endFrame }`; `planCommit(spans, bufferSamples, { hop, guardSamples, maxSamples }) → { committed, pending, cut }`.
- [x] Copy model files to `public/models/deepcw/` (+ AGPL LICENSE from deepcw-engine 8e264d2, README with source, commit, SHA-256 `ef1207…fe02`).
- [x] Tests: validateMeta accepts the committed JSON, rejects wrong bin count; resampler keeps a 700 Hz tone (amplitude ±2 %, frequency ±1 %), attenuates 2 kHz ≥ 40 dB, chunked = one-shot, 44.1 kHz length ≈ n·3200/44100; spectrogram equals the reference direct DFT (copied from the DeepCW example) to 1e-4; CTC merges repeats, splits on blank, reports spans; planCommit commits up to the last old space, keeps text inside the guard pending, caps at max.
- [x] Implement; run; commit.

### Task 6: DeepCwEngine + worker
- **Produces:** `type RunModel = (input, frames, bins) => Promise<Float32Array>`; `class DeepCwEngine { constructor(meta, run, inputRate) push(samples) step(): Promise<DecoderUpdate | null> }`; `deepcw/worker.ts` (ort wasm path via `?url`, `numThreads = 1`, model fetch with `progress` messages, `ready`, self-paced loop, errors → `error`). Vite: `worker.format = 'es'`, `optimizeDeps.exclude = ['onnxruntime-web']`.
- [x] Tests with the real model (onnxruntime-web in Node): 20 WPM at 0 dB and −6 dB → CER ≤ 0.1 on committed+pending; `K` visible < 3 s of audio time after its end; 10 s noise → no text.
- [x] Implement; run; commit.

### Task 7: Settings, mic, capture, engines client
- **Produces:** `DecoderSettings { engine, deviceId, filter: 'auto'|'off'|'fixed', filterHz, filterWidthHz: 250|500 }`, `DEFAULT_DECODER`, `normalizeDecoderSettings`; `Settings.schemaVersion = 4` with `decoder`, `setDecoder(s, d)`; `openMic`, `listMics`, `micErrorMessage`; `Capture.start(ctx, stream)`, `capture.analyser`, `.sampleRate`, `.attach(port)`, `.setFilter(FilterSetting)`, `.onEnded(cb)`, `.stop()`; `startEngine(name, capture, onMessage) → { stop() }`.
- [x] Tests: settings migration (v3 → v4 gets DEFAULT_DECODER, junk clamps); micErrorMessage for NotAllowedError, NotFoundError, NotReadableError, plain Error.
- [x] Implement; run; commit.

### Task 8: Decode page, waterfall, navigation
- [x] `Waterfall` (AnalyserNode → scrolling canvas 0–1500 Hz, marker, click → pitch); `Decode` page (Start/Stop, status, engine/mic/filter/width selects, readout, DeepCW range hint, text with pending span, Clear/Copy, errors, cleanup on unmount, engine switch while running, auto filter follows pitch); nav link + Home card; CSS.
- [x] `npm run lint && npm run typecheck && npm test && npm run build`; commit.

### Task 9: End-to-end
- [x] `e2e/fixtures/fakeMic.ts` (global setup writes `e2e/.fake-mic/cw.wav`, 48 kHz, 20 WPM, 6 dB), Playwright project `decode` with Chrome fake-mic flags and microphone permission; `decode.spec.ts`: each engine shows `DL1ABC DL1ABC K` within the WAV's signal end + 3 s (+1 s slack) of listening; `decode-errors.spec.ts`: blocked mic → alert and Start enabled; engine choice persists across reload.
- [x] Full `npm run test:e2e`; commit.
