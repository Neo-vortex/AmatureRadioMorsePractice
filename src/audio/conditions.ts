export type NoiseType = 'off' | 'white' | 'pink'

export interface Conditions {
  noise: { type: NoiseType; snrDb: number }
  /** Receiver bandpass width; 0 = no filter. */
  bandwidthHz: 0 | 250 | 500 | 2400
  qsb: { depthDb: number; rateHz: number }
  qrm: { stations: number; levelDb: number; maxOffsetHz: number }
  qrn: { perMinute: number; levelDb: number }
  /** Human sending: jitter and speedDrift are fractions (0.1 = 10 %). */
  fist: { jitter: number; speedDrift: number; chirpHz: number; driftHz: number }
}

export const BANDWIDTHS = [0, 250, 500, 2400] as const
export const PRESET_NAMES = ['clean', 'light-noise', 'moderate', 'weak-dx', 'contest', 'poor'] as const
export type PresetName = (typeof PRESET_NAMES)[number]

export const PRESET_LABELS: Record<PresetName, string> = {
  clean: 'Clean',
  'light-noise': 'Light noise',
  moderate: 'Moderate',
  'weak-dx': 'Weak DX',
  contest: 'Contest pileup',
  poor: 'Poor conditions',
}

export const CLEAN: Conditions = {
  noise: { type: 'off', snrDb: 20 },
  bandwidthHz: 0,
  qsb: { depthDb: 0, rateHz: 0.1 },
  qrm: { stations: 0, levelDb: -10, maxOffsetHz: 300 },
  qrn: { perMinute: 0, levelDb: -6 },
  fist: { jitter: 0, speedDrift: 0, chirpHz: 0, driftHz: 0 },
}

export const PRESETS: Record<PresetName, Conditions> = {
  clean: CLEAN,
  'light-noise': { ...CLEAN, noise: { type: 'pink', snrDb: 15 } },
  moderate: {
    ...CLEAN,
    noise: { type: 'pink', snrDb: 8 },
    bandwidthHz: 500,
    qsb: { depthDb: 8, rateHz: 0.1 },
    qrm: { stations: 1, levelDb: -10, maxOffsetHz: 300 },
  },
  'weak-dx': {
    ...CLEAN,
    noise: { type: 'white', snrDb: 3 },
    bandwidthHz: 500,
    qsb: { depthDb: 20, rateHz: 0.15 },
    qrn: { perMinute: 6, levelDb: -6 },
  },
  contest: {
    ...CLEAN,
    noise: { type: 'pink', snrDb: 10 },
    bandwidthHz: 500,
    qrm: { stations: 3, levelDb: -6, maxOffsetHz: 400 },
  },
  poor: {
    noise: { type: 'pink', snrDb: 0 },
    bandwidthHz: 2400,
    qsb: { depthDb: 15, rateHz: 0.2 },
    qrm: { stations: 2, levelDb: -8, maxOffsetHz: 250 },
    qrn: { perMinute: 12, levelDb: 0 },
    fist: { jitter: 0.15, speedDrift: 0.05, chirpHz: 30, driftHz: 20 },
  },
}

export function isPresetName(x: unknown): x is PresetName {
  return PRESET_NAMES.some((p) => p === x)
}

const obj = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {})

function num(x: unknown, fallback: number, min: number, max: number, integer = false): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return fallback
  const v = integer ? Math.round(x) : x
  return Math.min(max, Math.max(min, v))
}

/** Turns stored/untrusted data into valid Conditions, clamping every range. */
export function normalizeConditions(raw: unknown): Conditions {
  const r = obj(raw)
  const noise = obj(r.noise)
  const qsb = obj(r.qsb)
  const qrm = obj(r.qrm)
  const qrn = obj(r.qrn)
  const fist = obj(r.fist)
  const noiseType = noise.type === 'white' || noise.type === 'pink' ? noise.type : 'off'
  const bandwidth = BANDWIDTHS.find((b) => b === r.bandwidthHz) ?? 0
  return {
    noise: { type: noiseType, snrDb: num(noise.snrDb, CLEAN.noise.snrDb, -10, 30) },
    bandwidthHz: bandwidth,
    qsb: { depthDb: num(qsb.depthDb, 0, 0, 30), rateHz: num(qsb.rateHz, CLEAN.qsb.rateHz, 0.05, 0.5) },
    qrm: {
      stations: num(qrm.stations, 0, 0, 3, true),
      levelDb: num(qrm.levelDb, CLEAN.qrm.levelDb, -30, 6),
      maxOffsetHz: num(qrm.maxOffsetHz, CLEAN.qrm.maxOffsetHz, 50, 400),
    },
    qrn: { perMinute: num(qrn.perMinute, 0, 0, 60), levelDb: num(qrn.levelDb, CLEAN.qrn.levelDb, -30, 6) },
    fist: {
      jitter: num(fist.jitter, 0, 0, 0.3),
      speedDrift: num(fist.speedDrift, 0, 0, 0.2),
      chirpHz: num(fist.chirpHz, 0, 0, 100),
      driftHz: num(fist.driftHz, 0, 0, 50),
    },
  }
}
