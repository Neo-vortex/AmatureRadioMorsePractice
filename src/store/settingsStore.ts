import { get, set } from 'idb-keyval'
import { DEFAULT_SETTINGS, migrateSettings, type Settings } from './settings'

export const SETTINGS_KEY = 'settings'

export async function loadSettings(): Promise<Settings> {
  try {
    return migrateSettings(await get(SETTINGS_KEY))
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  try {
    await set(SETTINGS_KEY, s)
  } catch {
    // Storage unavailable (e.g. private browsing): settings live in memory for this session.
  }
}
