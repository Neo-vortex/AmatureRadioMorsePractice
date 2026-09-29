# Live Microphone Decoder — Design Spec

Date: 2026-09-29
Status: Draft for review

## 1. Purpose

A **Decode** page that listens to the microphone and turns Morse (CW) into text live.
The microphone may hear a radio's speaker (off-air signals: noise, fading, QRM) or the
user's own key and practice oscillator.

Success criteria:

- Live text with **at most 3 s delay** between a word being sent and it appearing.
- Two user-selectable engines:
  - **ggmorse** (default) — classic DSP decoder, fast and small.
  - **DeepCW** (optional) — neural decoder, stronger in weak/impaired signals.
- Robust to noise without speech denoisers (see §2).
- Runs fully in the browser; no server; deployable to GitHub Pages as today.

Out of scope for this spec: scoring the user's sending (the Send mode in the main spec
can reuse this decoder later), multi-signal/pileup decoding, training our own model,
multithreaded inference.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Default engine | [ggmorse](https://github.com/ggerganov/ggmorse) (MIT), C++ compiled to WASM | Streaming DSP decoder with automatic pitch (200–1200 Hz) and speed (5–55 WPM) detection |
| Optional engine | [DeepCW](https://github.com/e04/deepcw-engine) ONNX model (AGPL-3.0) via `onnxruntime-web` | Measured error-free at −6 dB SNR on synthetic CW (§9) |
| Project license | **AGPL-3.0-only** | Required to bundle the AGPL DeepCW model. Third-party content keeps its own license (Tatoeba CC BY 2.0 FR, FrequencyWords MIT, ggmorse MIT) |
| Noise handling | Browser `echoCancellation`, `noiseSuppression`, `autoGainControl` all **off**; optional narrow bandpass at the signal pitch; DeepCW itself is the learned noise-robust part | Speech denoisers (RNNoise, DTLN, the browser's own) treat a steady tone as noise and suppress it |
| Where engines run | Each engine in its own Web Worker; an AudioWorklet only forwards microphone audio | Loading WASM inside an AudioWorklet is awkward; workers keep the UI and audio thread free |
| DeepCW threads | Single-threaded WASM | Fits the latency budget (§9); multithreading needs cross-origin isolation, which GitHub Pages can't set without a service-worker shim — deferred |
| Model hosting | `public/models/deepcw/` committed to the repo (15 MB, plain git, not LFS) | GitHub Pages doesn't serve LFS files; loaded only when DeepCW is picked, then HTTP-cached |
| ggmorse build | `npm run wasm:build` in a pinned `emscripten/emsdk` Docker image; built `.js` + `.wasm` committed | Dev and CI need no Emscripten or Docker |

## 3. Architecture

```
getUserMedia (EC/NS/AGC off, mono)
  → MediaStreamSource
  → [BiquadFilter bandpass — optional, auto/fixed pitch]
  → AnalyserNode (waterfall)
  → AudioWorklet "mic-tap" — posts Float32 chunks (~20 ms) over a MessagePort
        → Worker: ggmorse   ─┐
        → Worker: DeepCW    ─┴→ DecoderUpdate messages → Decode page
```

Only the selected engine's worker receives audio. Switching engines disconnects the
port from the old worker (it is terminated) and connects a new one; the text decoded so
far stays on screen.

### 3.1 Engine interface (`src/decoder/types.ts`)

Both workers speak the same protocol:

```ts
// page → worker
type EngineIn =
  | { type: 'init'; sampleRate: number; port: MessagePort } // port delivers audio chunks

// worker → page
type EngineOut =
  | { type: 'ready' }
  | { type: 'progress'; loaded: number; total: number } // model download (DeepCW)
  | { type: 'update'; committed: string; pending: string; pitchHz: number | null; wpm: number | null }
  | { type: 'error'; message: string }
```

`committed` is **new** final text since the last update (appended by the page);
`pending` **replaces** the previous provisional text.

## 4. Modules

```
vendor/ggmorse/            upstream source (pinned commit) + LICENSE
wasm/ggmorse/
  wrapper.cpp              C API: gm_create(sampleRate), gm_push(ptr, n), gm_take_text(buf, max),
                           gm_pitch(), gm_wpm(), gm_destroy()
  build.sh                 emcc -O3, MODULARIZE, ES module, no filesystem
src/decoder/
  types.ts                 protocol above
  mic.ts                   openMic(deviceId) → MediaStream with EC/NS/AGC off; listMics()
  capture.ts               builds the Web Audio chain, owns the worklet port, bandpass control
  micTap.worklet.ts        AudioWorkletProcessor forwarding 128-sample blocks, batched to ~20 ms
  ggmorse/
    ggmorse.js, ggmorse.wasm   build output (committed)
    worker.ts              loads WASM, pushes audio, polls text/stats every 100 ms
  deepcw/
    metadata.ts            typed view of model.onnx.json + validation
    resample.ts            any rate → 3200 Hz (windowed-sinc low-pass + linear interp)
    spectrogram.ts         Hann, 256-pt real FFT, hop 48, reflect pad, bins 400–1200 Hz (65), log1p
    ctc.ts                 greedy CTC decode → { text, spans: {char, startFrame, endFrame}[] }
    stream.ts              streaming commit logic (§5) — pure, no ONNX
    worker.ts              loads ort + model, runs the loop
public/models/deepcw/
  model.onnx, model.onnx.json, LICENSE, README.md (source, commit, SHA-256)
src/ui/pages/Decode.tsx    the page (§6)
src/ui/Waterfall.tsx       canvas waterfall from the AnalyserNode
```

`src/audio/*` (playback) is untouched.

## 4a. ggmorse squelch

Measured 2026-09-30 (spike): ggmorse decodes a clean-to-0 dB exchange perfectly with
~0.7 s average (≤ 2 s) delay, but keeps "decoding" pure noise after the signal stops
(e.g. `?IUE`, `5?ES6?HE`) because it hunts for a pitch. `src/decoder/squelch.ts` gates
its output: every 50 ms, the Hann-windowed ~85 ms spectrum's peak in 300–1200 Hz is
compared to the median bin; > 17 dB counts as a tone (noise measured ≤ 13 dB, CW at
0 dB SNR ≥ 22 dB). Text is kept while a tone was seen within the last 4 s; a ggmorse
pitch jump (`'\n'` in its output) with no tone in the last 0.5 s closes it at once.
DeepCW produced no text on pure noise, so it has no squelch.

## 5. DeepCW streaming

The model takes a whole window of audio (the reference example uses 5–20 s), so
streaming is done by repeatedly re-decoding a short rolling buffer:

- `buffer`: 3200 Hz audio received since the last commit point, **capped at 10 s**.
- Loop: as soon as the previous inference finishes (self-pacing — a fast machine
  refreshes about every 0.3 s, a slow one less often), if at least 0.25 s of new audio
  has arrived:
  1. Pad the buffer at the start with silence to at least 2 s (startup).
  2. Spectrogram → model → greedy CTC with character spans.
  3. **Commit** every word whose final character ends more than **1.25 s** before the
     buffer end (the tail guard), i.e. up to the last word space older than the guard.
     Committed text is emitted; the buffer is cut at the middle of that space.
  4. Everything after the commit point is emitted as `pending`.
- If the buffer reaches 10 s with no committable word space (only noise, or one very long
  word), drop the oldest audio down to 10 s; characters whose spans end inside the
  dropped audio are committed as-is.
- Pitch for the readout and Auto filter: the spectrogram bin with the highest mean
  magnitude over the frames where a character was decoded (null if none).
- Frame ↔ sample: `sample = frame × 48` (hop), relative to the unpadded buffer start.

`stream.ts` takes the CTC result and buffer length and returns
`{ committed, pending, cutSample }`; it has no knowledge of ONNX, so it is unit-tested
with hand-made spans.

Expected delay: pending text ≈ inference time + ≤0.25 s; committed ≈ 1.25 s guard +
one refresh ≈ 1.5–2.5 s.

The model's analysis band is fixed at 400–1200 Hz; the page tells the user to tune the
signal into that range when DeepCW is selected.

## 6. Decode page (`#/decode`)

- Nav link **Decode** next to Receive and Text → Morse.
- Controls: **Start / Stop**, microphone select (labels appear after permission),
  engine select (ggmorse / DeepCW), filter: Auto (follows detected pitch) · Off ·
  fixed pitch; filter width 250 / 500 Hz.
- Waterfall (400 px tall max, full width); clicking it sets a fixed filter pitch and
  switches the filter to fixed.
- Readout: detected pitch (Hz) and speed (WPM), or "—".
- Text area: committed text in normal colour, pending text in muted colour; auto-scrolls;
  **Clear** and **Copy** buttons.
- DeepCW first use: progress bar while the model (15 MB) and runtime load.
- Settings persisted with the existing settings store: engine, device id, filter mode,
  filter pitch and width.
- Errors shown in the page's existing `role="alert"` style:
  - permission denied → how to allow the microphone;
  - no input device;
  - model/runtime failed to load → offer to retry or switch to ggmorse;
  - AudioWorklet unsupported → "this browser can't decode live audio".
- Leaving the page stops the microphone and terminates the worker.

## 7. Error handling

- Worker crashes (`error` event) → page shows the error, stops capture; Start retries.
- Model metadata validation: the computed bin count must equal
  `spectrogram_frequency_bins`, sample rate/FFT/hop must match the code's constants —
  otherwise the worker reports an error instead of decoding garbage.
- Microphone device unplugged (`track.onended`) → stop, show message.

## 8. Testing

**Unit (vitest, Node):**
- `spectrogram.ts` matches the reference direct-DFT implementation from the DeepCW
  example to 1e-4 on random audio.
- `resample.ts`: a 700 Hz tone at 48 kHz → 3200 Hz keeps its frequency and amplitude;
  content above 1.6 kHz is attenuated ≥ 40 dB.
- `ctc.ts`: blanks, repeats, spans.
- `stream.ts`: commit only before the guard, cut position, 10 s cap, pending replaced.

**Engine (vitest, Node):** audio from the app's own encoder + a Node-side synthesizer
with white noise, at 3200/48000 Hz:
- ggmorse WASM decodes a callsign exchange at 20 and 30 WPM, SNR ≥ 0 dB.
- DeepCW (onnxruntime-web WASM backend in Node) decodes it at SNR ≥ −6 dB.
- Pass thresholds (character error rate) are fixed from measured results when the
  tests are first written, with margin.

**End-to-end (Playwright, Chromium):** Chrome's fake microphone
(`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`) plays a
WAV rendered with the app's generator (moderate conditions). For each engine: Start →
the expected words appear, and each word appears within 3 s of its end time in the WAV.

## 9. Measurements behind the decisions (2026-09-29)

DeepCW model on synthetic CW at 22 WPM, `CQ CQ DE DL1ABC …`, white noise over the full
3200 Hz band: correct at +10, 0 and −6 dB; nothing usable at −10 dB.

Inference time per window, `onnxruntime-web` 1.24.3 WASM in Node, 20-core desktop:

| Window | 1 thread | 4 threads |
|---|---|---|
| 5 s | 97 ms | 33 ms |
| 10 s | 236 ms | 75 ms |
| 20 s | 633 ms | 203 ms |
| 30 s | 1177 ms | 384 ms |

A 2–3× slower laptop still decodes a 10 s window in under 0.75 s on one thread.

An independent evaluation ([AetherSDR #4817](https://github.com/aethersdr/AetherSDR/issues/4817))
found DeepCW no better than DSP on steady tones in white noise; its gains are expected
on QSB, drift, QRM and imperfect sending — hence ggmorse stays the default.

## 10. Licensing and credits

- Add `LICENSE` (AGPL-3.0 text) and `"license": "AGPL-3.0-only"` in `package.json`.
- `vendor/ggmorse/LICENSE` (MIT) and `public/models/deepcw/LICENSE` (AGPL-3.0) kept.
- README **Credits** section and footer link: ggmorse (Georgi Gerganov, MIT), DeepCW
  (e04, AGPL-3.0), onnxruntime-web (MIT).
- The deployed site links to its source repository (AGPL §13).
