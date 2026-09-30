import type { Span } from './ctc'

export interface CommitOptions {
  /** Samples per spectrogram frame: frame f ↔ sample f × hop. */
  hop: number
  /** Text ending this close to the buffer end may still change: it stays pending. */
  guardSamples: number
  /** Buffer cap: older audio is dropped. */
  maxSamples: number
}

export interface CommitPlan {
  /** Becomes final. */
  committed: string
  /** Shown provisionally. */
  pending: string
  /** Samples to drop from the start of the buffer. */
  cut: number
}

const join = (spans: readonly Span[]) => spans.map((s) => s.char).join('')

/**
 * Decides which decoded text is final. Words that ended before the guard are committed up
 * to the last word space, and the buffer is cut in the middle of that space. With no such
 * space and a full buffer, the oldest audio goes and the characters in it are committed.
 */
export function planCommit(spans: readonly Span[], bufferSamples: number, o: CommitOptions): CommitPlan {
  const limit = bufferSamples - o.guardSamples
  let split = -1
  spans.forEach((s, k) => {
    if (s.char === ' ' && s.endFrame * o.hop <= limit) split = k
  })
  if (split >= 0) {
    const space = spans[split]
    return {
      committed: join(spans.slice(0, split + 1)),
      pending: join(spans.slice(split + 1)),
      cut: Math.round(((space.startFrame + space.endFrame) / 2) * o.hop),
    }
  }
  if (bufferSamples > o.maxSamples) {
    const cut = bufferSamples - o.maxSamples
    let old = 0
    while (old < spans.length && spans[old].endFrame * o.hop < cut) old++
    return { committed: join(spans.slice(0, old)), pending: join(spans.slice(old)), cut }
  }
  return { committed: '', pending: join(spans), cut: 0 }
}
