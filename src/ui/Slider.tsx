interface Props {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
}

export function Slider({ label, value, min, max, step, format = String, onChange }: Props) {
  return (
    <div className="slider">
      <span>
        {label} <output>{format(value)}</output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </div>
  )
}
