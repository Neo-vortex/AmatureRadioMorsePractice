import { describe, expect, it } from 'vitest'
import { micErrorMessage } from './mic'

describe('micErrorMessage', () => {
  it('explains a blocked microphone', () => {
    expect(micErrorMessage(new DOMException('no', 'NotAllowedError'))).toMatch(/Microphone access was blocked/)
  })

  it('explains a missing microphone', () => {
    expect(micErrorMessage(new DOMException('none', 'NotFoundError'))).toMatch(/No microphone found/)
    expect(micErrorMessage({ name: 'OverconstrainedError', message: '' })).toMatch(/No microphone found/)
  })

  it('explains a busy microphone', () => {
    expect(micErrorMessage(new DOMException('busy', 'NotReadableError'))).toMatch(/in use/)
  })

  it('passes other errors through', () => {
    expect(micErrorMessage(new Error('No AudioWorklet here'))).toBe('No AudioWorklet here')
    expect(micErrorMessage('odd')).toBe("Couldn't open the microphone: odd")
  })
})
