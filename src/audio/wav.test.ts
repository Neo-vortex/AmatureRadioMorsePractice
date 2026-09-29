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
