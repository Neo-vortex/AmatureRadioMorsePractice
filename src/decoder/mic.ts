/** A steady tone is exactly what speech processing removes, so all of it is switched off. */
export const CW_AUDIO: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
}

export interface MicInfo {
  id: string
  label: string
}

export async function openMic(deviceId: string | null): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This page needs a secure (https) connection to use the microphone.')
  return navigator.mediaDevices.getUserMedia({ audio: { ...CW_AUDIO, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) } })
}

/** Audio inputs; labels are empty until the user has granted microphone access once. */
export async function listMics(): Promise<MicInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'audioinput' && d.deviceId !== '')
    .map((d, k) => ({ id: d.deviceId, label: d.label || `Microphone ${k + 1}` }))
}

export function micErrorMessage(err: unknown): string {
  const name = typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access was blocked. Allow the microphone for this site (the icon in the address bar) and press Start again.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone found. Connect one or pick another input, then press Start again.'
  }
  if (name === 'NotReadableError') return 'The microphone is in use by another application.'
  if (err instanceof Error) return err.message
  return `Couldn't open the microphone: ${String(err)}`
}
