import { useEffect, useRef } from 'react'

interface Props {
  analyser: AnalyserNode | null
  maxHz: number
  /** Filter centre to mark, or null. */
  markerHz: number | null
  onPick: (hz: number) => void
}

const WIDTH = 600
const HEIGHT = 160
const FLOOR_DB = -110
const RANGE_DB = 70

/** Dark blue → amber by signal strength v in [0, 1]. */
function colour(v: number): [number, number, number] {
  return [Math.round(11 + 240 * v), Math.round(17 + 174 * v), Math.round(32 + 4 * v)]
}

/** Scrolling spectrum of the raw microphone input, newest at the top. Click to pick a pitch. */
export function Waterfall({ analyser, maxHz, markerHz, onPick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const g = canvas?.getContext('2d')
    if (!canvas || !g) return
    g.fillStyle = 'rgb(11, 17, 32)'
    g.fillRect(0, 0, WIDTH, HEIGHT)
    if (!analyser) return
    const data = new Float32Array(analyser.frequencyBinCount)
    const binHz = analyser.context.sampleRate / analyser.fftSize
    const row = g.createImageData(WIDTH, 1)
    let frame = 0
    const draw = () => {
      analyser.getFloatFrequencyData(data)
      g.drawImage(canvas, 0, 0, WIDTH, HEIGHT - 1, 0, 1, WIDTH, HEIGHT - 1)
      for (let x = 0; x < WIDTH; x++) {
        const db = data[Math.min(data.length - 1, Math.round(((x / WIDTH) * maxHz) / binHz))]
        const [r, gr, b] = colour(Math.max(0, Math.min(1, (db - FLOOR_DB) / RANGE_DB)))
        row.data[x * 4] = r
        row.data[x * 4 + 1] = gr
        row.data[x * 4 + 2] = b
        row.data[x * 4 + 3] = 255
      }
      g.putImageData(row, 0, 0)
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [analyser, maxHz])

  const ticks = [0, 250, 500, 750, 1000, 1250, 1500].filter((t) => t <= maxHz)
  return (
    <div className="waterfall">
      <canvas
        ref={ref}
        width={WIDTH}
        height={HEIGHT}
        aria-label="Waterfall — click to set the filter pitch"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          onPick(Math.round((((e.clientX - rect.left) / rect.width) * maxHz) / 10) * 10)
        }}
      />
      {markerHz !== null && <div className="waterfall-marker" style={{ left: `${(markerHz / maxHz) * 100}%` }} />}
      <div className="waterfall-axis" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  )
}
