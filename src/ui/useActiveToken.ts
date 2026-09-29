import { useEffect, useState, type RefObject } from 'react'
import type { PlaybackHandle } from '../audio/engine'

/** Follows the character being keyed while `playing` is true (one update per animation frame). */
export function useActiveToken(playing: boolean, handleRef: RefObject<PlaybackHandle | null>): number | null {
  const [active, setActive] = useState<number | null>(null)
  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      setActive(handleRef.current?.currentToken() ?? null)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, handleRef])
  return playing ? active : null
}
