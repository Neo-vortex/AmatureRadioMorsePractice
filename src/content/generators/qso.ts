import { pick, randInt, type Rng } from '../rng'
import { generateCallsign } from './callsigns'
import { generateRst } from './numbers'

const NAMES = ['JOHN', 'BOB', 'MIKE', 'DAVE', 'TOM', 'JIM', 'BILL', 'ED', 'AL', 'JOE', 'ANN', 'SUE', 'MARY', 'LIZ',
  'PETER', 'HANS', 'KLAUS', 'PIERRE', 'MARCO', 'JUAN', 'IVAN', 'ALI', 'REZA', 'KEN', 'YUKI', 'RAJ', 'LEO', 'MAX']
const QTHS = ['BOSTON', 'DENVER', 'TEXAS', 'OHIO', 'LONDON', 'PARIS', 'BERLIN', 'MUNICH', 'ROME', 'MADRID',
  'TOKYO', 'SYDNEY', 'TORONTO', 'TEHRAN', 'MOSCOW', 'WARSAW', 'PRAGUE', 'VIENNA', 'OSLO', 'DUBLIN', 'LISBON']
const RIGS = ['IC7300', 'IC7610', 'FT991', 'FTDX10', 'K3', 'K4', 'KX2', 'TS590', 'QCX', 'HOMEBREW']
const ANTS = ['DIPOLE', 'YAGI', 'VERTICAL', 'EFHW', 'LOOP', 'WIRE', 'GP']
const WX = ['SUNNY', 'CLOUDY', 'RAIN', 'SNOW', 'FOGGY', 'WINDY', 'HOT', 'COLD']
const GREETINGS = ['GM', 'GA', 'GE']

/** A complete ragchew QSO. Station A calls CQ, B answers. BT = "=", AR = "+". */
export function generateQsoScript(rng: Rng): string[] {
  const a = generateCallsign(rng, false)
  const b = generateCallsign(rng, false)
  const [nameA, nameB] = [pick(rng, NAMES), pick(rng, NAMES)]
  const [qthA, qthB] = [pick(rng, QTHS), pick(rng, QTHS)]
  const [rstA, rstB] = [generateRst(rng), generateRst(rng)]
  const greet = pick(rng, GREETINGS)
  const temp = randInt(rng, -10, 35)
  return [
    `CQ CQ CQ DE ${a} ${a} K`,
    `${a} DE ${b} ${b} K`,
    `${b} DE ${a} ${greet} TNX FER CALL = UR RST ${rstB} ${rstB} = NAME ${nameA} ${nameA} = QTH ${qthA} ${qthA} = HW? + ${b} DE ${a} <KN>`,
    `${a} DE ${b} R ${greet} ${nameA} TNX FER RPT = UR RST ${rstA} ${rstA} = NAME ${nameB} ${nameB} = QTH ${qthB} ${qthB} = RIG ${pick(rng, RIGS)} ES ANT ${pick(rng, ANTS)} = WX ${pick(rng, WX)} ${temp < 0 ? 'MINUS ' : ''}${Math.abs(temp)}C + ${a} DE ${b} <KN>`,
    `${b} DE ${a} R FB ${nameB} TNX FER QSO = 73 ES GL + ${b} DE ${a} <SK>`,
    `${a} DE ${b} TU ${nameA} 73 <SK> EE`,
  ]
}
