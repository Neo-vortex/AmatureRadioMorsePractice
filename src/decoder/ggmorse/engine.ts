import { Squelch } from '../squelch'
import type { DecoderUpdate } from '../types'

/** The part of the Emscripten module built from wasm/ggmorse/wrapper.cpp that we use. */
export interface GgmorseModule {
  HEAPF32: Float32Array
  UTF8ToString(ptr: number): string
  _gm_create(sampleRate: number): number
  _gm_input(decoder: number, n: number): number
  _gm_push(decoder: number, n: number): void
  _gm_take_text(decoder: number): number
  _gm_pitch(decoder: number): number
  _gm_wpm(decoder: number): number
  _gm_destroy(decoder: number): void
}

/** ggmorse behind a squelch: whatever it "decodes" while no tone is present is noise. */
export class GgmorseEngine {
  private readonly m: GgmorseModule
  private readonly decoder: number
  private readonly squelch: Squelch
  private text = ''
  private lastWasSpace = true

  constructor(m: GgmorseModule, sampleRate: number) {
    this.m = m
    this.decoder = m._gm_create(sampleRate)
    this.squelch = new Squelch(sampleRate)
  }

  push(samples: Float32Array): void {
    const ptr = this.m._gm_input(this.decoder, samples.length)
    // Read HEAPF32 after _gm_input: growing the WASM memory replaces the view.
    this.m.HEAPF32.set(samples, ptr >> 2)
    this.m._gm_push(this.decoder, samples.length)
    this.squelch.push(samples)
    const raw = this.m.UTF8ToString(this.m._gm_take_text(this.decoder))
    // ggmorse prints '\n' when its pitch estimate jumps; with no tone around it is hunting in noise.
    if (raw.includes('\n')) this.squelch.pitchLost()
    if (!this.squelch.isOpen()) return
    for (const ch of raw.replace(/\n/g, ' ')) {
      const space = ch === ' '
      if (space && this.lastWasSpace) continue
      this.text += ch
      this.lastWasSpace = space
    }
  }

  /** Text since the previous call and the current estimates (null while squelched). */
  take(): DecoderUpdate {
    const open = this.squelch.isOpen()
    const update: DecoderUpdate = {
      committed: this.text,
      pending: '',
      pitchHz: open ? this.m._gm_pitch(this.decoder) : null,
      wpm: open ? this.m._gm_wpm(this.decoder) : null,
    }
    this.text = ''
    return update
  }

  destroy(): void {
    this.m._gm_destroy(this.decoder)
  }
}
