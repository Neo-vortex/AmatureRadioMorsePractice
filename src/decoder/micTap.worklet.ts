// Audio thread: forwards microphone audio to the decoder worker in ~20 ms chunks.
const CHUNK = 1024

class MicTap extends AudioWorkletProcessor {
  private out: MessagePort | null = null
  private buf = new Float32Array(CHUNK)
  private n = 0

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<{ port: MessagePort | null }>) => {
      this.out?.close()
      this.out = e.data.port
      this.n = 0
    }
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0]
    if (input && this.out) {
      for (const sample of input) {
        this.buf[this.n++] = sample
        if (this.n === CHUNK) {
          this.out.postMessage(this.buf, [this.buf.buffer])
          this.buf = new Float32Array(CHUNK)
          this.n = 0
        }
      }
    }
    return true
  }
}

registerProcessor('mic-tap', MicTap)
