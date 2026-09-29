import { describe, expect, it, vi } from 'vitest'
import { FADE_SECONDS, fadeOutAndStop } from './fade'

describe('fadeOutAndStop', () => {
  it('fades the volume smoothly to zero instead of cutting it, then stops after the fade', () => {
    const gain = { cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() }
    const osc = { stop: vi.fn() }
    fadeOutAndStop(gain as unknown as AudioParam, osc, 3)
    expect(gain.setValueAtTime).not.toHaveBeenCalled()
    expect(gain.setTargetAtTime).toHaveBeenCalledWith(0, 3, expect.any(Number))
    const tau = gain.setTargetAtTime.mock.calls[0][2] as number
    // After FADE_SECONDS the exponential approach must be below -40 dB.
    expect(Math.exp(-FADE_SECONDS / tau)).toBeLessThan(0.01)
    expect(osc.stop).toHaveBeenCalledWith(3 + FADE_SECONDS)
  })
})
