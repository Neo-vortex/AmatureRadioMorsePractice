import { pick, type Rng } from '../rng'

export interface Code {
  code: string
  meaning: string
}

export const QCODES: readonly Code[] = [
  { code: 'QRL', meaning: 'Is the frequency in use?' },
  { code: 'QRM', meaning: 'Interference from other stations' },
  { code: 'QRN', meaning: 'Static / atmospheric noise' },
  { code: 'QRO', meaning: 'Increase power' },
  { code: 'QRP', meaning: 'Reduce power / low power' },
  { code: 'QRQ', meaning: 'Send faster' },
  { code: 'QRS', meaning: 'Send slower' },
  { code: 'QRT', meaning: 'Stop sending / closing station' },
  { code: 'QRU', meaning: 'Nothing more for you' },
  { code: 'QRV', meaning: 'I am ready' },
  { code: 'QRX', meaning: 'Wait / stand by' },
  { code: 'QRZ', meaning: 'Who is calling me?' },
  { code: 'QSB', meaning: 'Your signal is fading' },
  { code: 'QSL', meaning: 'I acknowledge receipt' },
  { code: 'QSO', meaning: 'A contact' },
  { code: 'QSY', meaning: 'Change frequency' },
  { code: 'QTH', meaning: 'My location is' },
  { code: 'QTR', meaning: 'The correct time is' },
]

export const ABBREVIATIONS: readonly Code[] = [
  { code: 'ABT', meaning: 'about' },
  { code: 'AGN', meaning: 'again' },
  { code: 'ANT', meaning: 'antenna' },
  { code: 'BK', meaning: 'break' },
  { code: 'CFM', meaning: 'confirm' },
  { code: 'CQ', meaning: 'calling any station' },
  { code: 'CUL', meaning: 'see you later' },
  { code: 'DE', meaning: 'from / this is' },
  { code: 'DR', meaning: 'dear' },
  { code: 'ES', meaning: 'and' },
  { code: 'FB', meaning: 'fine business (excellent)' },
  { code: 'FER', meaning: 'for' },
  { code: 'GA', meaning: 'good afternoon / go ahead' },
  { code: 'GE', meaning: 'good evening' },
  { code: 'GM', meaning: 'good morning' },
  { code: 'GL', meaning: 'good luck' },
  { code: 'HR', meaning: 'here' },
  { code: 'HW', meaning: 'how (copy)?' },
  { code: 'OM', meaning: 'old man (fellow operator)' },
  { code: 'OP', meaning: 'operator' },
  { code: 'PSE', meaning: 'please' },
  { code: 'PWR', meaning: 'power' },
  { code: 'RIG', meaning: 'radio equipment' },
  { code: 'RPT', meaning: 'report / repeat' },
  { code: 'RST', meaning: 'readability, strength, tone' },
  { code: 'SRI', meaning: 'sorry' },
  { code: 'TNX', meaning: 'thanks' },
  { code: 'TU', meaning: 'thank you' },
  { code: 'UR', meaning: 'your / you are' },
  { code: 'WX', meaning: 'weather' },
  { code: '73', meaning: 'best regards' },
  { code: '88', meaning: 'love and kisses' },
  { code: '5NN', meaning: '599 in cut numbers' },
]

export function generateQcodes(rng: Rng, count: number): string {
  const all = [...QCODES, ...ABBREVIATIONS]
  return Array.from({ length: count }, () => pick(rng, all).code).join(' ')
}
