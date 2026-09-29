export interface TimingInput {
  charWpm: number
  effWpm: number
  /** Additional word gap as a multiple of the normal word gap (0 = none). */
  extraWordGap: number
}

/** Durations in seconds. */
export interface Timing {
  dit: number
  dah: number
  elementGap: number
  charGap: number
  wordGap: number
}

/** Length of one Morse unit at the given speed, using the 50-unit word "PARIS ". */
export function unitSeconds(wpm: number): number {
  return 1.2 / wpm
}

export function makeTiming({ charWpm, effWpm, extraWordGap }: TimingInput): Timing {
  const u = unitSeconds(charWpm)
  const eff = Math.min(effWpm, charWpm)
  let charGap = 3 * u
  let wordGap = 7 * u
  if (eff < charWpm) {
    // ARRL Farnsworth: total extra delay per word, split 3:7 between char and word gaps.
    const ta = (60 * charWpm - 37.2 * eff) / (eff * charWpm)
    charGap = (3 * ta) / 19
    wordGap = (7 * ta) / 19
  }
  return { dit: u, dah: 3 * u, elementGap: u, charGap, wordGap: wordGap * (1 + extraWordGap) }
}
