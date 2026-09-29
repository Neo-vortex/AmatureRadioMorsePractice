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
