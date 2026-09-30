import type { EngineName } from './types'

export type FilterMode = 'auto' | 'off' | 'fixed'

export interface DecoderSettings {
  engine: EngineName
  /** Microphone deviceId; null = the browser's default input. */
  deviceId: string | null
  /** auto = follow the detected pitch. */
  filter: FilterMode
  filterHz: number
  filterWidthHz: 250 | 500
}

export const FILTER_MIN_HZ = 300
export const FILTER_MAX_HZ = 1200

export const DEFAULT_DECODER: DecoderSettings = {
  engine: 'ggmorse',
  deviceId: null,
  filter: 'off',
  filterHz: 650,
  filterWidthHz: 500,
}

/** Turns stored/untrusted data into valid decoder settings. */
export function normalizeDecoderSettings(raw: unknown): DecoderSettings {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const hz = typeof r.filterHz === 'number' && Number.isFinite(r.filterHz) ? r.filterHz : DEFAULT_DECODER.filterHz
  return {
    engine: r.engine === 'deepcw' || r.engine === 'ggmorse' ? r.engine : DEFAULT_DECODER.engine,
    deviceId: typeof r.deviceId === 'string' && r.deviceId !== '' ? r.deviceId : null,
    filter: r.filter === 'auto' || r.filter === 'fixed' || r.filter === 'off' ? r.filter : DEFAULT_DECODER.filter,
    filterHz: Math.round(Math.min(FILTER_MAX_HZ, Math.max(FILTER_MIN_HZ, hz))),
    filterWidthHz: r.filterWidthHz === 250 ? 250 : 500,
  }
}
