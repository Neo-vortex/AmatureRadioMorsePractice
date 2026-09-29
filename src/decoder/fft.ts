const twiddles = new Map<number, { cos: Float64Array; sin: Float64Array }>()

function table(n: number) {
  let t = twiddles.get(n)
  if (!t) {
    t = { cos: new Float64Array(n / 2), sin: new Float64Array(n / 2) }
    for (let k = 0; k < n / 2; k++) {
      t.cos[k] = Math.cos((2 * Math.PI * k) / n)
      t.sin[k] = Math.sin((2 * Math.PI * k) / n)
    }
    twiddles.set(n, t)
  }
  return t
}

/** |X[k]|² for k = 0…n/2 of a real frame; n must be a power of two. */
export function powerSpectrum(frame: ArrayLike<number>): Float64Array {
  const n = frame.length
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`FFT size must be a power of two, got ${n}`)
  const re = Float64Array.from(frame)
  const im = new Float64Array(n)
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tmp = re[i]
      re[i] = re[j]
      re[j] = tmp
    }
  }
  const { cos, sin } = table(n)
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1
    const stride = n / len
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const c = cos[k * stride]
        const s = -sin[k * stride]
        const a = i + k
        const b = a + half
        const tr = re[b] * c - im[b] * s
        const ti = re[b] * s + im[b] * c
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
      }
    }
  }
  const out = new Float64Array(n / 2 + 1)
  for (let k = 0; k <= n / 2; k++) out[k] = re[k] * re[k] + im[k] * im[k]
  return out
}
