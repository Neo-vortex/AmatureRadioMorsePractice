import type { Capture } from './capture'
import type { EngineIn, EngineName, EngineOut } from './types'

export interface EngineHandle {
  stop(): void
}

function spawn(name: EngineName): Worker {
  // Literal URLs, so Vite bundles each worker.
  return name === 'ggmorse'
    ? new Worker(new URL('./ggmorse/worker.ts', import.meta.url), { type: 'module' })
    : new Worker(new URL('./deepcw/worker.ts', import.meta.url), { type: 'module' })
}

/** Starts an engine worker and points the capture's audio at it through a fresh port. */
export function startEngine(name: EngineName, capture: Capture, onMessage: (m: EngineOut) => void): EngineHandle {
  const worker = spawn(name)
  worker.onmessage = (e: MessageEvent<EngineOut>) => onMessage(e.data)
  worker.onerror = (e) => {
    e.preventDefault()
    onMessage({ type: 'error', message: e.message || 'The decoder stopped unexpectedly.' })
  }
  const channel = new MessageChannel()
  const init: EngineIn = { type: 'init', sampleRate: capture.sampleRate, port: channel.port2 }
  worker.postMessage(init, [channel.port2])
  capture.attach(channel.port1)
  return { stop: () => worker.terminate() }
}
