import { useCallback, useEffect, useRef, useState } from 'react'
import { engine, type PlaybackHandle } from '../../audio/engine'
import { CONTENT_CHOICES, type ContentChoice } from '../../content/choices'
import { library } from '../../content/library'
import { newSeed } from '../../content/rng'
import { expectedPatterns, MORSE_CHART, parseMorseInput, patternToText, toPattern, unsupportedChars } from '../../morse/pattern'
import { makeTiming } from '../../morse/timing'
import { setContent, type Settings } from '../../store/settings'
import type { UpdateSettings } from '../../store/useSettings'
import { makeItem, type ExerciseItem } from '../../training/itemSource'
import { alignTokens, type ScoreResult } from '../../training/scoring'
import { SpeedBar } from '../SpeedBar'

type Status = 'ready' | 'loading' | 'playing' | 'finished'
const STATUS_TEXT: Record<Status, string> = { ready: 'Ready', loading: 'Loading…', playing: 'Playing…', finished: 'Finished' }

export function Encode({ settings, update }: { settings: Settings; update: UpdateSettings }) {
  const [item, setItem] = useState<ExerciseItem | null>(null)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<ScoreResult | null>(null)
  const [status, setStatus] = useState<Status>('ready')
  const [error, setError] = useState<string | null>(null)
  const [freeText, setFreeText] = useState('CQ CQ DE K1ABC K')
  const requestRef = useRef(0)
  const handleRef = useRef<PlaybackHandle | null>(null)
  const answerRef = useRef<HTMLInputElement>(null)

  useEffect(
    () => () => {
      requestRef.current++
      engine.stop()
    },
    [],
  )

  const playTokens = (tokens: string[]) => {
    engine.unlock()
    setStatus('playing')
    const handle = engine.play({
      text: '',
      tokens,
      timing: makeTiming(settings),
      pitchHz: settings.pitchHz,
      volume: settings.volume,
      conditions: settings.conditions,
      seed: item?.seed ?? 0,
      onEnd: () => {
        if (handleRef.current !== handle) return
        handleRef.current = null
        setStatus('finished')
      },
    })
    handleRef.current = handle
  }

  const next = useCallback(async () => {
    const request = ++requestRef.current
    engine.stop()
    setItem(null)
    setAnswer('')
    setResult(null)
    setError(null)
    setStatus('loading')
    try {
      const it = await makeItem(settings, newSeed(), library)
      if (request !== requestRef.current) return
      setItem(it)
      setStatus('ready')
      answerRef.current?.focus()
    } catch {
      if (request !== requestRef.current) return
      setStatus('ready')
      setError("Couldn't load practice content. Check your connection and try again.")
    }
  }, [settings])

  const check = () => {
    if (!item) return
    setResult(alignTokens(expectedPatterns(item.text), parseMorseInput(answer)))
  }

  const type = (s: string) => {
    setAnswer((a) => (s === 'back' ? a.slice(0, -1) : a + s))
    answerRef.current?.focus()
  }

  return (
    <div className="encode">
      <h1>Text → Morse</h1>
      <p className="lead">Write the text in Morse: <code>.</code> and <code>-</code>, a space between letters, <code>/</code> between words.</p>
      <SpeedBar settings={settings} update={update} />
      <label className="field content-field">
        <span>Content</span>
        <select aria-label="Content type" value={settings.content} onChange={(e) => update((s) => setContent(s, e.target.value as ContentChoice))}>
          {CONTENT_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </label>

      <div className="controls">
        <button type="button" className="primary" onClick={() => void next()}>New prompt</button>
        <span role="status" className={`status status-${status}`}>{STATUS_TEXT[status]}</span>
      </div>
      {error && <p role="alert" className="error">{error}</p>}

      {item && (
        <>
          <p className="prompt mono" data-testid="prompt-text">{item.text}</p>
          <form className="answer" onSubmit={(e) => { e.preventDefault(); check() }}>
            <label htmlFor="morse-answer">Your Morse</label>
            <div className="answer-row">
              <input id="morse-answer" ref={answerRef} className="mono" autoComplete="off" spellCheck={false}
                value={answer} onChange={(e) => { setAnswer(e.target.value); setResult(null) }} />
              <button type="submit">Check</button>
            </div>
            <div className="morse-keys">
              <button type="button" aria-label="Dot" onClick={() => type('.')}>·</button>
              <button type="button" aria-label="Dash" onClick={() => type('-')}>−</button>
              <button type="button" aria-label="Letter space" onClick={() => type(' ')}>␣</button>
              <button type="button" aria-label="Word space" onClick={() => type(' / ')}>/</button>
              <button type="button" aria-label="Backspace" onClick={() => type('back')}>⌫</button>
            </div>
          </form>
          <div className="controls">
            <button type="button" onClick={() => playTokens(parseMorseInput(answer).map((p) => (p === ' ' ? ' ' : `#${p}`)))} disabled={!answer.trim()}>
              Hear my answer
            </button>
            <button type="button" onClick={() => playTokens(expectedPatterns(item.text).map((p) => (p === ' ' ? ' ' : `#${p}`)))} disabled={!result}>
              Hear correct
            </button>
            <button type="button" onClick={() => engine.stop()} disabled={status !== 'playing'}>Stop</button>
          </div>
          {result && (
            <section className="score" aria-label="Result">
              <p className="accuracy">Accuracy: {Math.round(result.accuracy * 100)}%</p>
              <table className="pattern-table mono">
                <thead><tr><th>Expected</th><th>You wrote</th></tr></thead>
                <tbody>
                  {result.ops.filter((op) => !(op.kind === 'match' && op.char === ' ')).map((op, k) => {
                    const exp = op.kind === 'match' ? op.char : op.kind === 'extra' ? '' : op.expected
                    const got = op.kind === 'match' ? op.char : op.kind === 'missing' ? '' : op.typed
                    return (
                      <tr key={k} className={`op-${op.kind}`}>
                        <td>{exp && exp !== ' ' ? `${patternToText(exp)}  ${exp}` : exp === ' ' ? '(word space)' : '—'}</td>
                        <td>{got && got !== ' ' ? `${got}  (${patternToText(got)})` : got === ' ' ? '(word space)' : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}

      <details className="translator">
        <summary>Translator &amp; chart</summary>
        <label className="field">
          <span>Text to translate</span>
          <textarea aria-label="Text to translate" rows={2} value={freeText} onChange={(e) => setFreeText(e.target.value)} />
        </label>
        {unsupportedChars(freeText).length > 0 && (
          <p className="hint">No Morse code for (skipped): {unsupportedChars(freeText).join(' ')}</p>
        )}
        <div className="morse-output mono" data-testid="morse-output">
          {toPattern(freeText).map((word, w) => (
            <span key={w} className="morse-word">
              <span className="morse-letters" aria-hidden="true">{word.map((c) => c.token).join(' ')}</span>
              <span className="morse-pattern">{word.map((c) => c.pattern).join(' ')}</span>
            </span>
          ))}
        </div>
        <div className="chart mono">
          {MORSE_CHART.map((c) => (
            <span key={c.token}><b>{c.token}</b> {c.pattern}</span>
          ))}
        </div>
      </details>
    </div>
  )
}
