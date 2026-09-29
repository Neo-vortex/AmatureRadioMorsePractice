import { afterEach, describe, expect, it, vi } from 'vitest'
import { MorseEngine } from './engine'

afterEach(() => vi.unstubAllGlobals())

describe('MorseEngine.unlock', () => {
  it('creates and resumes the AudioContext synchronously (inside the user gesture)', () => {
    const resume = vi.fn(async () => {})
    const created = vi.fn()
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'suspended'
        resume = resume
        constructor() {
          created()
        }
      },
    )
    const engine = new MorseEngine()
    engine.unlock()
    expect(created).toHaveBeenCalledTimes(1)
    expect(resume).toHaveBeenCalledTimes(1)
    engine.unlock()
    expect(created).toHaveBeenCalledTimes(1)
  })
})
