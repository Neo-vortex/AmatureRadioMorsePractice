import type { EngineIn, EngineOut } from '../types'
import { GgmorseEngine } from './engine'
import createGgmorse from './ggmorse.mjs'

const UPDATE_MS = 100
const post = (m: EngineOut) => self.postMessage(m)

self.onmessage = async (e: MessageEvent<EngineIn>) => {
  if (e.data.type !== 'init') return
  const { sampleRate, port } = e.data
  try {
    // ggmorse printf()s every character; the page shows them, the console doesn't need to.
    const engine = new GgmorseEngine(await createGgmorse({ print: () => {}, printErr: () => {} }), sampleRate)
    port.onmessage = (m: MessageEvent<Float32Array>) => engine.push(m.data)
    setInterval(() => post({ type: 'update', ...engine.take() }), UPDATE_MS)
    post({ type: 'ready' })
  } catch (err) {
    post({ type: 'error', message: `The ggmorse decoder failed to start: ${err instanceof Error ? err.message : String(err)}` })
  }
}
