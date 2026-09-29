import type { Op, ScoreResult } from '../training/scoring'

function OpView({ op }: { op: Op }) {
  switch (op.kind) {
    case 'match':
      return <span className="op op-match">{op.char}</span>
    case 'sub':
      return (
        <span className="op op-sub" title={`You typed ${op.typed}`}>
          {op.expected}
        </span>
      )
    case 'missing':
      return (
        <span className="op op-missing" title="Missed">
          {op.expected}
        </span>
      )
    case 'extra':
      return (
        <span className="op op-extra" title="Extra character">
          {op.typed}
        </span>
      )
  }
}

export function ScoreView({ expected, result }: { expected: string; result: ScoreResult }) {
  return (
    <section className="score" aria-label="Result">
      <p className="accuracy">Accuracy: {Math.round(result.accuracy * 100)}%</p>
      <p>
        Sent: <code data-testid="sent-text">{expected}</code>
      </p>
      <p className="ops mono">
        {result.ops.map((op, k) => (
          <OpView key={k} op={op} />
        ))}
      </p>
      <p className="legend">
        <span className="op op-match">correct</span> <span className="op op-sub">wrong</span>{' '}
        <span className="op op-missing">missed</span> <span className="op op-extra">extra</span>
      </p>
    </section>
  )
}
