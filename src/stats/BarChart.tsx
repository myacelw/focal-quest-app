export function BarChart({ values, labels }: { values: number[]; labels: string[] }) {
  const W = 320
  const H = 160
  const pad = 28
  if (values.length === 0) return <p style={{ color: '#888' }}>暂无数据</p>

  const max = Math.max(...values, 1)
  const n = values.length
  const slot = (W - 2 * pad) / n
  const bw = slot * 0.6

  return (
    <svg width={W} height={H} role="img" aria-label="柱状图">
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#ccc" />
      {values.map((v, i) => {
        const h = (v / max) * (H - 2 * pad)
        const bx = pad + i * slot + (slot - bw) / 2
        return <rect key={i} x={bx} y={H - pad - h} width={bw} height={h} fill="#378add" />
      })}
      <text x={pad} y={pad - 8} fontSize={11} fill="#888">{max.toFixed(0)}</text>
      <text x={pad} y={H - 6} fontSize={10} fill="#888">{labels[0] ?? ''}</text>
      <text x={W - pad} y={H - 6} fontSize={10} fill="#888" textAnchor="end">
        {labels[labels.length - 1] ?? ''}
      </text>
    </svg>
  )
}
