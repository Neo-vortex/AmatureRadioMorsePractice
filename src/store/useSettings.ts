import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type Settings } from './settings'
import { loadSettings, saveSettings } from './settingsStore'

export type UpdateSettings = (fn: (s: Settings) => Settings) => void

export function useSettings(): { settings: Settings; update: UpdateSettings; loaded: boolean } {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    void loadSettings().then((s) => {
      if (!alive) return
      setSettings(s)
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (loaded) void saveSettings(settings)
  }, [settings, loaded])

  const update = useCallback<UpdateSettings>((fn) => setSettings(fn), [])
  return { settings, update, loaded }
}
