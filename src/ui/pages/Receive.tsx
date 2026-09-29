import { useCallback, useEffect, useRef, useState } from 'react'
import { engine, type PlaybackHandle } from '../../audio/engine'
import { newSeed } from '../../content/rng'
import { makeTiming } from '../../morse/timing'
import { nudgeSpeed, type Settings } from '../../store/settings'
import type { UpdateSettings } from '../../store/useSettings'
import { makeItem, type ExerciseItem } from '../../training/itemSource'
import { score, type ScoreResult } from '../../training/scoring'
import { ScoreView } from '../ScoreView'
import { SpeedBar } from '../SpeedBar'

type Status = 'ready' | 'playing' | 'finished'
const STATUS_TEXT: Record<Status, string> = { ready: 'Ready', playing: 'Playing…', finished: 'Finished' }

export function Receive({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  const [item, setItem] = useState<ExerciseItem | null>(null)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<ScoreResult | null>(null)
  const [status, setStatus] = useState<Status>('ready')
  const handleRef = useRef<PlaybackHandle | null>(null)
  const answerRef = useRef<HTMLInputElement>(null)

  const play = useCallback(
    (it: ExerciseItem) => {
      setStatus('playing')
      const handle = engine.play({
        text: it.text,
        timing: makeTiming(settings),
        pitchHz: settings.pitchHz,
        volume: settings.volume,
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

  const next = useCallback(() => {
    const it = makeItem(settings.level, newSeed())
    setItem(it)
    setAnswer('')
    setResult(null)
    play(it)
  }, [settings.level, play])

  const repeat = useCallback(() => {
    if (item) play(item)
  }, [item, play])

  const stop = useCallback(() => engine.stop(), [])

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

  useEffect(() => () => engine.stop(), [])

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
        next()
      } else if (e.key === 'r' || e.key === 'R') repeat()
      else if (e.key === '+' || e.key === '=') update((s) => nudgeSpeed(s, 1))
      else if (e.key === '-' || e.key === '_') update((s) => nudgeSpeed(s, -1))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [next, repeat, stop, update])

  const answering = item !== null && result === null

  return (
    <div className="receive">
      <h1>Receive</h1>
      <SpeedBar settings={settings} update={update} />

      <div className="controls">
        <button type="button" className="primary" onClick={next}>
          {item ? 'Next' : 'Play'}
        </button>
        <button type="button" onClick={repeat} disabled={!item}>
          Repeat
        </button>
        <button type="button" onClick={stop} disabled={status !== 'playing'}>
          Stop
        </button>
        <span role="status" className={`status status-${status}`}>
          {STATUS_TEXT[status]}
        </span>
      </div>

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

      {result && item && <ScoreView expected={item.text} result={result} />}

      <p className="hint">
        Enter/Space: play next · R: repeat · Esc: stop · +/−: speed · PageUp/PageDown: speed while typing (Shift ×5)
      </p>
    </div>
  )
}
