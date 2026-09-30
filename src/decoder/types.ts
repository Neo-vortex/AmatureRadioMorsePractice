export type EngineName = 'ggmorse' | 'deepcw'

export interface DecoderUpdate {
  /** New final text since the previous update (appended by the page). */
  committed: string
  /** Provisional text after the committed part (replaces the previous one). */
  pending: string
  pitchHz: number | null
  wpm: number | null
}

/** Page → engine worker. The port delivers Float32Array chunks of microphone audio. */
export type EngineIn = { type: 'init'; sampleRate: number; port: MessagePort }

/** Engine worker → page. */
export type EngineOut =
  | { type: 'ready' }
  | { type: 'progress'; loaded: number; total: number }
  | ({ type: 'update' } & DecoderUpdate)
  | { type: 'error'; message: string }
