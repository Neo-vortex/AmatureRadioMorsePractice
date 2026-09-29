import { getLevel, LEVELS, type Level } from '../training/difficulty'

export interface Settings {
  schemaVersion: 1
  level: Level | 'custom'
  charWpm: number
  effWpm: number
  /** When true, effective speed always equals character speed. */
  linkSpeeds: boolean
  extraWordGap: number
  pitchHz: number
  volume: number
}

export const SPEED_MIN = 5
export const SPEED_MAX = 60

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  level: 2,
  charWpm: 20,
  effWpm: 10,
  linkSpeeds: false,
  extraWordGap: 0,
  pitchHz: 600,
  volume: 0.5,
}

const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x))

export function normalizeSettings(s: Settings): Settings {
  const charWpm = clamp(Math.round(s.charWpm), SPEED_MIN, SPEED_MAX)
  const effWpm = s.linkSpeeds ? charWpm : clamp(Math.round(s.effWpm), SPEED_MIN, charWpm)
  return {
    ...s,
    charWpm,
    effWpm,
    extraWordGap: clamp(s.extraWordGap, 0, 5),
    pitchHz: clamp(Math.round(s.pitchHz), 400, 1000),
    volume: clamp(s.volume, 0, 1),
  }
}

/** Turns whatever was stored (possibly nothing, junk, or an old version) into valid Settings. */
export function migrateSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS
  const r = raw as Record<string, unknown>
  if (r.schemaVersion !== 1) return DEFAULT_SETTINGS
  const num = (key: keyof Settings) => {
    const v = r[key]
    return typeof v === 'number' && Number.isFinite(v) ? v : (DEFAULT_SETTINGS[key] as number)
  }
  const validLevel = r.level === 'custom' || LEVELS.some((l) => l.level === r.level)
  return normalizeSettings({
    schemaVersion: 1,
    level: validLevel ? (r.level as Settings['level']) : DEFAULT_SETTINGS.level,
    charWpm: num('charWpm'),
    effWpm: num('effWpm'),
    linkSpeeds: typeof r.linkSpeeds === 'boolean' ? r.linkSpeeds : DEFAULT_SETTINGS.linkSpeeds,
    extraWordGap: num('extraWordGap'),
    pitchHz: num('pitchHz'),
    volume: num('volume'),
  })
}

export function applyLevel(s: Settings, level: Level): Settings {
  const p = getLevel(level)
  return normalizeSettings({ ...s, level, charWpm: p.charWpm, effWpm: p.effWpm, linkSpeeds: p.charWpm === p.effWpm })
}

export function setCharWpm(s: Settings, wpm: number): Settings {
  return normalizeSettings({ ...s, level: 'custom', charWpm: wpm })
}

export function setEffWpm(s: Settings, wpm: number): Settings {
  return normalizeSettings({ ...s, level: 'custom', effWpm: wpm })
}

export function setLinkSpeeds(s: Settings, linked: boolean): Settings {
  return normalizeSettings({ ...s, linkSpeeds: linked })
}

export function nudgeSpeed(s: Settings, delta: number): Settings {
  const charWpm = clamp(s.charWpm + delta, SPEED_MIN, SPEED_MAX)
  return normalizeSettings({ ...s, level: 'custom', charWpm, effWpm: s.effWpm + delta })
}
