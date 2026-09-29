/** Uniform random number in [0, 1). */
export type Rng = () => number

/** Small, fast, seedable PRNG. Same seed → same sequence, so exercises can be replayed exactly. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]
}

/** The only place Math.random is allowed: choosing a fresh seed. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 32)
}
