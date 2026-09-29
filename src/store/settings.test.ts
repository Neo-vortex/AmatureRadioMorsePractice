import { describe, expect, it } from 'vitest'
import {
  applyLevel,
  DEFAULT_SETTINGS,
  migrateSettings,
  nudgeSpeed,
  setCharWpm,
  setEffWpm,
  setContent,
  setLinkSpeeds,
} from './settings'

describe('migrateSettings', () => {
  it('returns defaults for missing, junk or unknown-version data', () => {
    expect(migrateSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(migrateSettings('junk')).toEqual(DEFAULT_SETTINGS)
    expect(migrateSettings({ schemaVersion: 99, charWpm: 30 })).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid fields and replaces invalid ones with defaults', () => {
    const s = migrateSettings({ schemaVersion: 1, charWpm: 'fast', effWpm: 12, level: 9, pitchHz: 700 })
    expect(s.charWpm).toBe(DEFAULT_SETTINGS.charWpm)
    expect(s.effWpm).toBe(12)
    expect(s.level).toBe(DEFAULT_SETTINGS.level)
    expect(s.pitchHz).toBe(700)
  })

  it('clamps out-of-range values', () => {
    const s = migrateSettings({ schemaVersion: 1, charWpm: 500, effWpm: 400, pitchHz: 5, volume: 3, extraWordGap: -1 })
    expect(s.charWpm).toBe(60)
    expect(s.effWpm).toBe(60)
    expect(s.pitchHz).toBe(400)
    expect(s.volume).toBe(1)
    expect(s.extraWordGap).toBe(0)
  })
})

describe('speed setters', () => {
  it('applyLevel copies the profile speeds and links equal speeds', () => {
    expect(applyLevel(DEFAULT_SETTINGS, 1)).toMatchObject({ level: 1, charWpm: 18, effWpm: 5, linkSpeeds: false })
    expect(applyLevel(DEFAULT_SETTINGS, 4)).toMatchObject({ level: 4, charWpm: 25, effWpm: 25, linkSpeeds: true })
  })

  it('setCharWpm switches to custom and keeps effective ≤ character speed', () => {
    const s = setCharWpm({ ...DEFAULT_SETTINGS, charWpm: 20, effWpm: 15, linkSpeeds: false }, 12)
    expect(s).toMatchObject({ level: 'custom', charWpm: 12, effWpm: 12 })
  })

  it('setCharWpm drags effective speed along when linked', () => {
    const s = setCharWpm({ ...DEFAULT_SETTINGS, charWpm: 20, effWpm: 20, linkSpeeds: true }, 30)
    expect(s).toMatchObject({ charWpm: 30, effWpm: 30 })
  })

  it('setCharWpm rounds and clamps', () => {
    expect(setCharWpm(DEFAULT_SETTINGS, 99).charWpm).toBe(60)
    expect(setCharWpm(DEFAULT_SETTINGS, 2).charWpm).toBe(5)
    expect(setCharWpm(DEFAULT_SETTINGS, 22.6).charWpm).toBe(23)
  })

  it('setEffWpm cannot exceed character speed', () => {
    const s = setEffWpm({ ...DEFAULT_SETTINGS, charWpm: 20, effWpm: 10, linkSpeeds: false }, 25)
    expect(s).toMatchObject({ level: 'custom', effWpm: 20 })
  })

  it('setLinkSpeeds(true) sets effective = character speed', () => {
    const s = setLinkSpeeds({ ...DEFAULT_SETTINGS, charWpm: 20, effWpm: 10, linkSpeeds: false }, true)
    expect(s).toMatchObject({ linkSpeeds: true, effWpm: 20 })
  })

  it('nudgeSpeed moves both speeds and clamps at the limits', () => {
    const base = { ...DEFAULT_SETTINGS, charWpm: 20, effWpm: 10, linkSpeeds: false }
    expect(nudgeSpeed(base, 1)).toMatchObject({ level: 'custom', charWpm: 21, effWpm: 11 })
    expect(nudgeSpeed({ ...base, charWpm: 60, effWpm: 60 }, 5)).toMatchObject({ charWpm: 60, effWpm: 60 })
    expect(nudgeSpeed({ ...base, charWpm: 5, effWpm: 5 }, -1)).toMatchObject({ charWpm: 5, effWpm: 5 })
  })
})

describe('settings v2', () => {
  it('defaults content to auto', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ schemaVersion: 2, content: 'auto' })
  })

  it('migrates a v1 record, keeping its values', () => {
    const s = migrateSettings({ schemaVersion: 1, level: 'custom', charWpm: 28, effWpm: 20, linkSpeeds: false, extraWordGap: 0, pitchHz: 650, volume: 0.4 })
    expect(s).toMatchObject({ schemaVersion: 2, content: 'auto', level: 'custom', charWpm: 28, effWpm: 20, pitchHz: 650 })
  })

  it('keeps a valid content choice and rejects unknown ones', () => {
    expect(migrateSettings({ ...DEFAULT_SETTINGS, content: 'sentences' }).content).toBe('sentences')
    expect(migrateSettings({ ...DEFAULT_SETTINGS, content: 'klingon' }).content).toBe('auto')
  })

  it('setContent changes only the content choice', () => {
    expect(setContent(DEFAULT_SETTINGS, 'qso')).toEqual({ ...DEFAULT_SETTINGS, content: 'qso' })
  })
})
