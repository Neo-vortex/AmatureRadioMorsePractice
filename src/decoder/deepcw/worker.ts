import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import type { EngineIn, EngineOut } from '../types'
import { DeepCwEngine } from './engine'
import { validateMeta } from './metadata'

// One thread: threads need cross-origin isolation, which GitHub Pages can't provide.
ort.env.wasm.numThreads = 1
ort.env.wasm.wasmPaths = { wasm: wasmUrl }

const MODEL_DIR = `${import.meta.env.BASE_URL}models/deepcw/`
const IDLE_MS = 50
const post = (m: EngineOut) => self.postMessage(m)

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length')) || 0
  const parts: Uint8Array[] = []
  let loaded = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    loaded += value.length
    post({ type: 'progress', loaded, total })
  }
  const bytes = new Uint8Array(loaded)
  let at = 0
  for (const p of parts) {
    bytes.set(p, at)
    at += p.length
  }
  return bytes
}

self.onmessage = async (e: MessageEvent<EngineIn>) => {
  if (e.data.type !== 'init') return
  const { sampleRate, port } = e.data
  try {
    const metaRes = await fetch(`${MODEL_DIR}model.onnx.json`)
    if (!metaRes.ok) throw new Error(`model.onnx.json: HTTP ${metaRes.status}`)
    const meta = validateMeta(await metaRes.json())
    const session = await ort.InferenceSession.create(await download(`${MODEL_DIR}model.onnx`))
    const engine = new DeepCwEngine(
      meta,
      async (input, frames, bins) => {
        const out = await session.run({ [meta.onnx_input_name]: new ort.Tensor('float32', input, [1, 1, frames, bins]) })
        return out[meta.onnx_output_name].data as Float32Array
      },
      sampleRate,
    )
    // Audio that queued on the port while the model loaded is delivered now.
    port.onmessage = (m: MessageEvent<Float32Array>) => engine.push(m.data)
    post({ type: 'ready' })
    // Self-paced: decode again as soon as the previous decode finished and new audio is in.
    for (;;) {
      const update = await engine.step()
      if (update) post({ type: 'update', ...update })
      else await new Promise((resolve) => setTimeout(resolve, IDLE_MS))
    }
  } catch (err) {
    post({ type: 'error', message: `DeepCW failed to load: ${err instanceof Error ? err.message : String(err)}` })
  }
}
