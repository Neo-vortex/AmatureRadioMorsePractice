import { BANDWIDTHS, PRESET_LABELS, PRESET_NAMES, type Conditions, type NoiseType, type PresetName } from '../audio/conditions'
import { setConditions, setConditionsPreset, type Settings } from '../store/settings'
import type { UpdateSettings } from '../store/useSettings'
import { Slider } from './Slider'

const pct = (v: number) => `${Math.round(v * 100)}%`

export function ConditionsPanel({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  const c = settings.conditions
  const edit = (patch: (c: Conditions) => Conditions) => update((s) => setConditions(s, patch(s.conditions)))

  return (
    <section className="conditions" aria-label="Noise and interference">
      <label className="field">
        <span>Band conditions</span>
        <select
          aria-label="Band conditions"
          value={settings.conditionsPreset}
          onChange={(e) => {
            if (e.target.value !== 'custom') update((s) => setConditionsPreset(s, e.target.value as PresetName))
          }}
        >
          {PRESET_NAMES.map((p) => (
            <option key={p} value={p}>
              {PRESET_LABELS[p]}
            </option>
          ))}
          <option value="custom" disabled={settings.conditionsPreset !== 'custom'}>
            Custom
          </option>
        </select>
      </label>

      <details>
        <summary>Adjust conditions</summary>
        <div className="conditions-grid">
          <label className="field">
            <span>Noise</span>
            <select
              aria-label="Noise type"
              value={c.noise.type}
              onChange={(e) => edit((c) => ({ ...c, noise: { ...c.noise, type: e.target.value as NoiseType } }))}
            >
              <option value="off">Off</option>
              <option value="white">White</option>
              <option value="pink">Pink</option>
            </select>
          </label>
          <Slider label="Signal-to-noise (dB)" min={-10} max={30} step={1} value={c.noise.snrDb}
            onChange={(v) => edit((c) => ({ ...c, noise: { ...c.noise, snrDb: v } }))} />
          <label className="field">
            <span>Receiver filter</span>
            <select
              aria-label="Receiver bandwidth"
              value={c.bandwidthHz}
              onChange={(e) => edit((c) => ({ ...c, bandwidthHz: Number(e.target.value) as Conditions['bandwidthHz'] }))}
            >
              {BANDWIDTHS.map((b) => (
                <option key={b} value={b}>
                  {b === 0 ? 'Off' : `${b} Hz`}
                </option>
              ))}
            </select>
          </label>
          <Slider label="Fading depth (dB)" min={0} max={30} step={1} value={c.qsb.depthDb}
            onChange={(v) => edit((c) => ({ ...c, qsb: { ...c.qsb, depthDb: v } }))} />
          <Slider label="Fading speed (Hz)" min={0.05} max={0.5} step={0.05} value={c.qsb.rateHz}
            onChange={(v) => edit((c) => ({ ...c, qsb: { ...c.qsb, rateHz: v } }))} />
          <Slider label="Interfering stations" min={0} max={3} step={1} value={c.qrm.stations}
            onChange={(v) => edit((c) => ({ ...c, qrm: { ...c.qrm, stations: v } }))} />
          <Slider label="Interference level (dB)" min={-30} max={6} step={1} value={c.qrm.levelDb}
            onChange={(v) => edit((c) => ({ ...c, qrm: { ...c.qrm, levelDb: v } }))} />
          <Slider label="Static crashes per minute" min={0} max={60} step={1} value={c.qrn.perMinute}
            onChange={(v) => edit((c) => ({ ...c, qrn: { ...c.qrn, perMinute: v } }))} />
          <Slider label="Static level (dB)" min={-30} max={6} step={1} value={c.qrn.levelDb}
            onChange={(v) => edit((c) => ({ ...c, qrn: { ...c.qrn, levelDb: v } }))} />
          <Slider label="Timing jitter" min={0} max={0.3} step={0.01} value={c.fist.jitter} format={pct}
            onChange={(v) => edit((c) => ({ ...c, fist: { ...c.fist, jitter: v } }))} />
          <Slider label="Speed drift" min={0} max={0.2} step={0.01} value={c.fist.speedDrift} format={pct}
            onChange={(v) => edit((c) => ({ ...c, fist: { ...c.fist, speedDrift: v } }))} />
          <Slider label="Chirp (Hz)" min={0} max={100} step={5} value={c.fist.chirpHz}
            onChange={(v) => edit((c) => ({ ...c, fist: { ...c.fist, chirpHz: v } }))} />
          <Slider label="Pitch drift (Hz)" min={0} max={50} step={1} value={c.fist.driftHz}
            onChange={(v) => edit((c) => ({ ...c, fist: { ...c.fist, driftHz: v } }))} />
        </div>
      </details>
    </section>
  )
}
