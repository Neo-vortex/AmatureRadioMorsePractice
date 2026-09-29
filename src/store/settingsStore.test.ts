import { get, set } from 'idb-keyval'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from './settings'
import { LOAD_TIMEOUT_MS, loadSettings, saveSettings, SETTINGS_KEY } from './settingsStore'

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn() }))

beforeEach(() => {
  vi.mocked(get).mockReset()
  vi.mocked(set).mockReset()
})

describe('settingsStore', () => {
  it('loads and migrates stored settings', async () => {
    vi.mocked(get).mockResolvedValue({ ...DEFAULT_SETTINGS, charWpm: 33 })
    expect((await loadSettings()).charWpm).toBe(33)
    expect(get).toHaveBeenCalledWith(SETTINGS_KEY)
  })

  it('falls back to defaults when nothing is stored', async () => {
    vi.mocked(get).mockResolvedValue(undefined)
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to defaults when storage is unavailable', async () => {
    vi.mocked(get).mockRejectedValue(new Error('IndexedDB blocked'))
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('saves, and swallows storage errors', async () => {
    vi.mocked(set).mockResolvedValue(undefined)
    await saveSettings(DEFAULT_SETTINGS)
    expect(set).toHaveBeenCalledWith(SETTINGS_KEY, DEFAULT_SETTINGS)
    vi.mocked(set).mockRejectedValue(new Error('quota'))
    await expect(saveSettings(DEFAULT_SETTINGS)).resolves.toBeUndefined()
  })
})

describe('loadSettings timeout', () => {
  it('falls back to defaults if storage never answers', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(get).mockReturnValue(new Promise(() => {}))
      const pending = loadSettings()
      await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS)
      expect(await pending).toEqual(DEFAULT_SETTINGS)
    } finally {
      vi.useRealTimers()
    }
  })
})
