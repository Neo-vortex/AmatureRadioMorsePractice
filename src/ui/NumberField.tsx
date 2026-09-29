import { useState } from 'react'

interface Props {
  label: string
  value: number
  min: number
  max: number
  disabled?: boolean
  onCommit: (n: number) => void
}

/** Numeric input that only commits on blur/Enter, so typing "30" doesn't clamp at "3". */
export function NumberField({ label, value, min, max, disabled, onCommit }: Props) {
  const [draft, setDraft] = useState(String(value))
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    setDraft(String(value))
  }

  const commit = () => {
    const n = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(n)) {
      setDraft(String(value))
      return
    }
    const clamped = Math.min(max, Math.max(min, Math.round(n)))
    setDraft(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }

  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      disabled={disabled}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
    />
  )
}
