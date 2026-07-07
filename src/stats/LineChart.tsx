export function LineChart({ values, labels, unit }: { values: number[]; labels: string[]; unit?: string }) {
  const W = 320
  const H = 160
  const pad = 28
  if (values.length === 0) return <p style={{ color: '#888' }}>暂无数据</p>

  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const n = values.length
  const x = (i: number) => (n === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1))
  const y = (v: number) => H - pad - ((v - min) / range) * (H - 2 * pad)
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ')

  return (
    <svg width={W} height={H} role="img" aria-label="折线图">
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#ccc" />
      <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="#ccc" />
      <polyline points={pts} fill="none" stroke="#1d9e75" strokeWidth={2} />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={3} fill="#1d9e75" />
      ))}
      <text x={pad} y={pad - 8} fontSize={11} fill="#888">
        {max.toFixed(0)}
        {unit ?? ''}
      </text>
      <text x={pad} y={H - 6} fontSize={10} fill="#888">{labels[0] ?? ''}</text>
      <text x={W - pad} y={H - 6} fontSize={10} fill="#888" textAnchor="end">
        {labels[labels.length - 1] ?? ''}
      </text>
    </svg>
  )
}
