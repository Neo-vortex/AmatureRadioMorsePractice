import {
  applyLevel,
  nudgeSpeed,
  setCharWpm,
  setEffWpm,
  setLinkSpeeds,
  SPEED_MAX,
  SPEED_MIN,
  type Settings,
} from '../store/settings'
import type { UpdateSettings } from '../store/useSettings'
import { LEVELS, type Level } from '../training/difficulty'
import { NumberField } from './NumberField'

export function SpeedBar({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  return (
    <section className="speed-bar" aria-label="Speed and difficulty">
      <label className="field">
        <span>Difficulty</span>
        <select
          aria-label="Difficulty level"
          value={String(settings.level)}
          onChange={(e) => {
            if (e.target.value !== 'custom') update((s) => applyLevel(s, Number(e.target.value) as Level))
          }}
        >
          {LEVELS.map((l) => (
            <option key={l.level} value={l.level}>
              {l.level} · {l.name} ({l.charWpm}/{l.effWpm} WPM)
            </option>
          ))}
          <option value="custom" disabled={settings.level !== 'custom'}>
            Custom
          </option>
        </select>
      </label>

      <div className="field">
        <span>Character WPM</span>
        <div className="speed-stepper">
          <button type="button" aria-label="Slower" onClick={() => update((s) => nudgeSpeed(s, -1))}>
            −
          </button>
          <NumberField
            label="Character speed (WPM)"
            value={settings.charWpm}
            min={SPEED_MIN}
            max={SPEED_MAX}
            onCommit={(n) => update((s) => setCharWpm(s, n))}
          />
          <button type="button" aria-label="Faster" onClick={() => update((s) => nudgeSpeed(s, 1))}>
            +
          </button>
        </div>
        <input
          type="range"
          aria-label="Character speed slider"
          min={SPEED_MIN}
          max={SPEED_MAX}
          value={settings.charWpm}
          onChange={(e) => update((s) => setCharWpm(s, e.target.valueAsNumber))}
        />
      </div>

      <div className="field">
        <span>Effective WPM</span>
        <NumberField
          label="Effective speed (WPM)"
          value={settings.effWpm}
          min={SPEED_MIN}
          max={settings.charWpm}
          disabled={settings.linkSpeeds}
          onCommit={(n) => update((s) => setEffWpm(s, n))}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.linkSpeeds}
            onChange={(e) => update((s) => setLinkSpeeds(s, e.target.checked))}
          />
          Link speeds
        </label>
      </div>
    </section>
  )
}
