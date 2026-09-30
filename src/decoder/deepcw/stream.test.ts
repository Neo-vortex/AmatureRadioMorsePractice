import { describe, expect, it } from 'vitest'
import type { Span } from './ctc'
import { planCommit } from './stream'

const O = { hop: 48, guardSamples: 4000, maxSamples: 32000 }
const sp = (char: string, startFrame: number, endFrame = startFrame): Span => ({ char, startFrame, endFrame })
// "CQ DE": frames × 48 = samples.
const CQ_DE = [sp('C', 10), sp('Q', 20), sp(' ', 30, 34), sp('D', 50), sp('E', 60)]

describe('planCommit', () => {
  it('commits words up to the last space older than the guard', () => {
    const plan = planCommit(CQ_DE, 34 * 48 + 4000, O)
    expect(plan).toEqual({ committed: 'CQ ', pending: 'DE', cut: 32 * 48 })
  })

  it('keeps everything pending while the space is inside the guard', () => {
    expect(planCommit(CQ_DE, 34 * 48 + 3999, O)).toEqual({ committed: '', pending: 'CQ DE', cut: 0 })
  })

  it('uses the latest eligible space', () => {
    const spans = [...CQ_DE, sp(' ', 70, 72), sp('K', 90)]
    expect(planCommit(spans, 72 * 48 + 4000, O).committed).toBe('CQ DE ')
  })

  it('drops the oldest audio past the cap, committing the characters in it', () => {
    const spans = [sp('A', 10), sp('B', 700)]
    const plan = planCommit(spans, 40000, O)
    expect(plan).toEqual({ committed: 'A', pending: 'B', cut: 8000 })
  })
})
