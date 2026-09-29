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
