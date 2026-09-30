export interface Span {
  char: string
  /** First and last frame where this character was the most likely class. */
  startFrame: number
  endFrame: number
}

/** Greedy CTC decoding: best class per frame, repeats merged, blanks dropped. */
export function greedyCtc(
  logProbs: Float32Array,
  frames: number,
  classes: number,
  chars: readonly string[],
  blank: number,
): Span[] {
  const spans: Span[] = []
  let prev = blank
  for (let t = 0; t < frames; t++) {
    let best = 0
    let bestValue = -Infinity
    for (let c = 0; c < classes; c++) {
      const v = logProbs[t * classes + c]
      if (v > bestValue) {
        bestValue = v
        best = c
      }
    }
    if (best !== blank) {
      if (best === prev) spans[spans.length - 1].endFrame = t
      else spans.push({ char: chars[best], startFrame: t, endFrame: t })
    }
    prev = best
  }
  return spans
}
