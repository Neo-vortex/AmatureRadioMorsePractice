/** RMS of a full-scale sine: the reference for SNR. */
const SIGNAL_RMS = Math.SQRT1_2

/**
 * Signal and noise gains for a given SNR with constant total power (like a receiver's AGC):
 * lowering the SNR fades the signal into the noise instead of making everything louder.
 */
export function mixLevels(snrDb: number, noiseOn: boolean): { signalGain: number; noiseGain: number } {
  if (!noiseOn) return { signalGain: 1, noiseGain: 0 }
  const noiseToSignal = 10 ** (-snrDb / 10)
  const signalGain = 1 / Math.sqrt(1 + noiseToSignal)
  return { signalGain, noiseGain: SIGNAL_RMS * Math.sqrt(noiseToSignal / (1 + noiseToSignal)) }
}
