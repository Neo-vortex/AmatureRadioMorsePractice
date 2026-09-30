import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { encodeWav } from '../../src/audio/wav'
import { synthCw } from '../../src/decoder/testing/synth'

/** Chrome plays this file as the microphone (--use-file-for-fake-audio-capture), looping. */
export const FAKE_MIC_WAV = path.resolve('e2e/.fake-mic/cw.wav')
export const FAKE_MIC_TEXT = 'CQ CQ DE DL1ABC DL1ABC K'
const RATE = 48000

export const fakeMic = () => synthCw({ text: FAKE_MIC_TEXT, wpm: 20, snrDb: 6, sampleRate: RATE, lead: 2, tail: 6 })

export default function writeFakeMic(): void {
  mkdirSync(path.dirname(FAKE_MIC_WAV), { recursive: true })
  writeFileSync(FAKE_MIC_WAV, Buffer.from(encodeWav(fakeMic().audio, RATE)))
}
