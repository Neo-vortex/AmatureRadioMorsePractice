import { get, set } from 'idb-keyval'
import { DEFAULT_SETTINGS, migrateSettings, type Settings } from './settings'

export const SETTINGS_KEY = 'settings'
/** IndexedDB can hang without erroring (e.g. some Safari versions); don't block the app on it. */
export const LOAD_TIMEOUT_MS = 1500

export async function loadSettings(): Promise<Settings> {
  const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), LOAD_TIMEOUT_MS))
  try {
    return migrateSettings(await Promise.race([get(SETTINGS_KEY), timeout]))
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
