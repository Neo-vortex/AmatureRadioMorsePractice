import { useCallback, useEffect, useRef, useState } from 'react'
import { engine, type PlaybackHandle } from '../../audio/engine'
import { renderWav } from '../../audio/render'
import { CONTENT_CHOICES, type ContentChoice } from '../../content/choices'
import { library } from '../../content/library'
import { newSeed } from '../../content/rng'
import { makeTiming } from '../../morse/timing'
import { nudgeSpeed, setContent, type Settings } from '../../store/settings'
import type { UpdateSettings } from '../../store/useSettings'
import { makeItem, type ExerciseItem } from '../../training/itemSource'
import { score, type ScoreResult } from '../../training/scoring'
import { ConditionsPanel } from '../ConditionsPanel'
import { ScoreView } from '../ScoreView'
import { SpeedBar } from '../SpeedBar'
import { useActiveToken } from '../useActiveToken'

type Status = 'ready' | 'loading' | 'playing' | 'finished'
const STATUS_TEXT: Record<Status, string> = { ready: 'Ready', loading: 'Loading…', playing: 'Playing…', finished: 'Finished' }

export function Receive({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  const [item, setItem] = useState<ExerciseItem | null>(null)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<ScoreResult | null>(null)
  const [status, setStatus] = useState<Status>('ready')
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)
  const handleRef = useRef<PlaybackHandle | null>(null)
  const answerRef = useRef<HTMLInputElement>(null)
  // Shown in the Sent text once the answer has been checked (e.g. while repeating).
  const activeToken = useActiveToken(status === 'playing', handleRef)

  const play = useCallback(
    (it: ExerciseItem) => {
      setStatus('playing')
      const handle = engine.play({
        text: it.text,
        timing: makeTiming(settings),
        pitchHz: settings.pitchHz,
        volume: settings.volume,
        conditions: settings.conditions,
        seed: it.seed,
        onEnd: () => {
          // Ignore the end of a playback that a newer one already replaced.
          if (handleRef.current !== handle) return
          handleRef.current = null
          setStatus('finished')
        },
      })
      handleRef.current = handle
    },
    [settings],
  )

  const next = useCallback(async () => {
    // Only the newest request may play: rapid clicks while content loads are ignored.
    const request = ++requestRef.current
    handleRef.current = null
    engine.stop()
    // Start audio while still inside the click/key gesture; playback begins after the await.
    engine.unlock()
    setItem(null)
    setAnswer('')
    setResult(null)
    setError(null)
    setStatus('loading')
    try {
      const it = await makeItem(settings, newSeed(), library)
      if (request !== requestRef.current) return
      setItem(it)
      play(it)
    } catch {
      if (request !== requestRef.current) return
      setStatus('ready')
      setError("Couldn't load practice content. Check your connection and press Play to try again.")
    }
  }, [settings, play])

  const repeat = useCallback(() => {
    if (item) play(item)
  }, [item, play])

  const stop = useCallback(() => {
    // Also cancels an item that is still loading.
    requestRef.current++
    setStatus((s) => (s === 'loading' ? 'ready' : s))
    engine.stop()
  }, [])

  const submit = () => {
    if (!item || result) return
    handleRef.current = null
    engine.stop()
    setStatus('finished')
    setResult(score(item.text, answer))
  }

  // Speed changes re-time the rest of the item that is currently playing.
  const { charWpm, effWpm, extraWordGap } = settings
  useEffect(() => {
    handleRef.current?.setTiming(makeTiming({ charWpm, effWpm, extraWordGap }))
  }, [charWpm, effWpm, extraWordGap])

  useEffect(() => {
    if (item && !result) answerRef.current?.focus()
  }, [item, result])

  useEffect(
    () => () => {
      // Leaving the page: a pending load must not start playing afterwards.
      requestRef.current++
      engine.stop()
    },
    [],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 5 : 1
      if (e.key === 'Escape') return stop()
      if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault()
        return update((s) => nudgeSpeed(s, e.key === 'PageUp' ? step : -step))
      }
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 'Enter' || e.key === ' ') {
        if (tag === 'BUTTON') return
        e.preventDefault()
        void next()
      } else if (e.key === 'r' || e.key === 'R') repeat()
      else if (e.key === '+' || e.key === '=') update((s) => nudgeSpeed(s, 1))
      else if (e.key === '-' || e.key === '_') update((s) => nudgeSpeed(s, -1))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [next, repeat, stop, update])

  const answering = item !== null && result === null

  const downloadWav = async () => {
    if (!item) return
    try {
      const blob = await renderWav({
        text: item.text,
        timing: makeTiming(settings),
        pitchHz: settings.pitchHz,
        volume: settings.volume,
        conditions: settings.conditions,
        seed: item.seed,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cw-${item.kind}-${item.seed}.wav`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      setError("Couldn't create the WAV file in this browser.")
    }
  }

  return (
    <div className="receive">
      <h1>Receive</h1>
      <SpeedBar settings={settings} update={update} />
      <ConditionsPanel settings={settings} update={update} />

      <label className="field content-field">
        <span>Content</span>
        <select
          aria-label="Content type"
          value={settings.content}
          onChange={(e) => update((s) => setContent(s, e.target.value as ContentChoice))}
        >
          {CONTENT_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <div className="controls">
        <button type="button" className="primary" onClick={() => void next()}>
          {item ? 'Next' : 'Play'}
        </button>
        <button type="button" onClick={repeat} disabled={!item}>
          Repeat
        </button>
        <button type="button" onClick={stop} disabled={status !== 'playing' && status !== 'loading'}>
          Stop
        </button>
        <button type="button" onClick={() => void downloadWav()} disabled={!item}>
          Download WAV
        </button>
        <span role="status" className={`status status-${status}`}>
          {STATUS_TEXT[status]}
        </span>
      </div>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <form
        className="answer"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label htmlFor="answer">Type what you hear</label>
        <div className="answer-row">
          <input
            id="answer"
            ref={answerRef}
            className="mono"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={answer}
            disabled={!answering}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <button type="submit" disabled={!answering}>
            Check
          </button>
        </div>
      </form>

      {result && item && <ScoreView expected={item.text} result={result} activeToken={activeToken} />}

      <p className="hint">
        Enter/Space: play next · R: repeat · Esc: stop · +/−: speed · PageUp/PageDown: speed while typing (Shift ×5)
      </p>
    </div>
  )
}
