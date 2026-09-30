import { useCallback, useEffect, useRef, useState } from 'react'
import { Capture } from '../../decoder/capture'
import { startEngine, type EngineHandle } from '../../decoder/engines'
import { listMics, micErrorMessage, openMic, type MicInfo } from '../../decoder/mic'
import type { DecoderSettings, FilterMode } from '../../decoder/settings'
import type { EngineName, EngineOut } from '../../decoder/types'
import { setDecoder, type Settings } from '../../store/settings'
import type { UpdateSettings } from '../../store/useSettings'
import { Waterfall } from '../Waterfall'

type Status = 'idle' | 'starting' | 'loading' | 'listening'

const ENGINES: { value: EngineName; label: string }[] = [
  { value: 'ggmorse', label: 'ggmorse — fast, classic DSP' },
  { value: 'deepcw', label: 'DeepCW — neural, for weak signals' },
]
const FILTERS: { value: FilterMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'auto', label: 'Auto (follow the signal)' },
  { value: 'fixed', label: 'Fixed pitch' },
]
const WATERFALL_MAX_HZ = 1500

function effectiveFilterHz(d: DecoderSettings, pitchHz: number | null): number | null {
  if (d.filter === 'fixed') return d.filterHz
  if (d.filter === 'auto' && pitchHz !== null) return Math.round(pitchHz / 10) * 10
  return null
}

export function Decode({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  const d = settings.decoder
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [committed, setCommitted] = useState('')
  const [pending, setPending] = useState('')
  const [pitchHz, setPitchHz] = useState<number | null>(null)
  const [wpm, setWpm] = useState<number | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [mics, setMics] = useState<MicInfo[]>([])
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const captureRef = useRef<Capture | null>(null)
  const engineRef = useRef<EngineHandle | null>(null)
  const pendingRef = useRef('')
  const textRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(true)

  const edit = (patch: Partial<DecoderSettings>) => update((s) => setDecoder(s, { ...s.decoder, ...patch }))

  const stop = useCallback(() => {
    engineRef.current?.stop()
    engineRef.current = null
    captureRef.current?.stop()
    captureRef.current = null
    // Provisional text is the best guess there is: keep it.
    const rest = pendingRef.current
    if (rest) setCommitted((t) => t + rest)
    pendingRef.current = ''
    setPending('')
    setAnalyser(null)
    setStatus('idle')
    setPitchHz(null)
    setWpm(null)
    setProgress(null)
  }, [])

  const onMessage = useCallback(
    (m: EngineOut) => {
      if (m.type === 'progress') setProgress(m.total > 0 ? m.loaded / m.total : null)
      else if (m.type === 'ready') {
        setStatus('listening')
        setProgress(null)
      } else if (m.type === 'update') {
        if (m.committed) setCommitted((t) => t + m.committed)
        pendingRef.current = m.pending
        setPending(m.pending)
        setPitchHz(m.pitchHz)
        setWpm(m.wpm)
      } else {
        setError(m.message)
        stop()
      }
    },
    [stop],
  )

  const runEngine = useCallback(
    (name: EngineName) => {
      const capture = captureRef.current
      if (!capture) return
      engineRef.current?.stop()
      setStatus('loading')
      setPitchHz(null)
      setWpm(null)
      engineRef.current = startEngine(name, capture, onMessage)
    },
    [onMessage],
  )

  const start = async () => {
    setError(null)
    setStatus('starting')
    // Created inside the click: Safari only starts audio from a user gesture.
    const ctx = new AudioContext()
    void ctx.resume()
    let stream: MediaStream | null = null
    try {
      stream = await openMic(d.deviceId)
      const capture = await Capture.start(ctx, stream)
      if (!mountedRef.current) return capture.stop()
      captureRef.current = capture
      capture.onEnded(() => {
        setError('The microphone was disconnected.')
        stop()
      })
      setAnalyser(capture.analyser)
      runEngine(d.engine)
      setMics(await listMics())
    } catch (err) {
      if (!captureRef.current) {
        stream?.getTracks().forEach((t) => t.stop())
        void ctx.close()
      }
      if (!mountedRef.current) return
      stop()
      setError(micErrorMessage(err))
    }
  }

  // Microphone names are only visible once access was granted (possibly on an earlier visit).
  useEffect(() => {
    listMics()
      .then(setMics)
      .catch(() => {})
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      engineRef.current?.stop()
      captureRef.current?.stop()
    }
  }, [])

  const filterHz = effectiveFilterHz(d, pitchHz)
  useEffect(() => {
    captureRef.current?.setFilter(filterHz === null ? { mode: 'off' } : { mode: 'on', hz: filterHz, widthHz: d.filterWidthHz })
  }, [filterHz, d.filterWidthHz, analyser])

  useEffect(() => {
    const el = textRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [committed, pending])

  const statusText =
    status === 'loading'
      ? `Loading ${d.engine === 'deepcw' ? 'DeepCW' : 'decoder'}${progress !== null ? ` ${Math.round(progress * 100)}%` : '…'}`
      : { idle: 'Stopped', starting: 'Starting…', listening: 'Listening' }[status]

  return (
    <div className="decode">
      <h1>Decode</h1>
      <p className="lead">Listens to your microphone — a radio's speaker or your own key — and writes the Morse it hears.</p>

      <div className="controls">
        {status === 'idle' ? (
          <button type="button" className="primary" onClick={() => void start()}>
            Start
          </button>
        ) : (
          <button type="button" onClick={stop} disabled={status === 'starting'}>
            Stop
          </button>
        )}
        <label className="field">
          <span>Engine</span>
          <select
            aria-label="Decoder engine"
            value={d.engine}
            onChange={(e) => {
              const engine = e.target.value as EngineName
              edit({ engine })
              if (captureRef.current) runEngine(engine)
            }}
          >
            {ENGINES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Microphone</span>
          <select
            aria-label="Microphone"
            value={d.deviceId ?? ''}
            disabled={status !== 'idle'}
            onChange={(e) => edit({ deviceId: e.target.value || null })}
          >
            <option value="">Default input</option>
            {mics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Filter</span>
          <select aria-label="Filter" value={d.filter} onChange={(e) => edit({ filter: e.target.value as FilterMode })}>
            {FILTERS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Width</span>
          <select
            aria-label="Filter width"
            value={d.filterWidthHz}
            disabled={d.filter === 'off'}
            onChange={(e) => edit({ filterWidthHz: Number(e.target.value) === 250 ? 250 : 500 })}
          >
            <option value={500}>500 Hz</option>
            <option value={250}>250 Hz</option>
          </select>
        </label>
        <span role="status" className={`status status-${status}`}>
          {statusText}
        </span>
      </div>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <Waterfall
        analyser={analyser}
        maxHz={WATERFALL_MAX_HZ}
        markerHz={filterHz}
        onPick={(hz) => edit({ filter: 'fixed', filterHz: hz })}
      />

      <p className="readout">
        Pitch <strong>{pitchHz !== null ? `${Math.round(pitchHz)} Hz` : '—'}</strong> · Speed{' '}
        <strong>{wpm !== null ? `${Math.round(wpm)} WPM` : '—'}</strong>
      </p>
      {d.engine === 'deepcw' && (
        <p className="hint">DeepCW hears 400–1200 Hz: tune the signal into that range. Its first start downloads about 27 MB.</p>
      )}

      <div className="decode-text mono" aria-label="Decoded text" aria-live="polite" ref={textRef}>
        {committed}
        <span className="pending">{pending}</span>
      </div>
      <div className="controls">
        <button
          type="button"
          onClick={() => {
            setCommitted('')
            setPending('')
            pendingRef.current = ''
          }}
          disabled={!committed && !pending}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(committed + pending)}
          disabled={!committed && !pending}
        >
          Copy
        </button>
      </div>
    </div>
  )
}
