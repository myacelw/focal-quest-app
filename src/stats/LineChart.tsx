export function LineChart({ values, labels, unit }: { values: number[]; labels: string[]; unit?: string }) {
  const W = 320
  const H = 160
  const pad = 28
  if (values.length === 0) return <p style={{ color: 'var(--muted)' }}>暂无数据</p>

  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const n = values.length
  const x = (i: number) => (n === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1))
  const y = (v: number) => H - pad - ((v - min) / range) * (H - 2 * pad)
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const area = `${x(0)},${H - pad} ${pts} ${x(n - 1)},${H - pad}`

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="折线图" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="lcFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6c4bf0" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#6c4bf0" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#efe7fb" />
      <polygon points={area} fill="url(#lcFill)" />
      <polyline points={pts} fill="none" stroke="#6c4bf0" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill="#fff" stroke="#6c4bf0" strokeWidth={2} />
      ))}
      <text x={pad} y={pad - 8} fontSize={11} fill="#9a8fc0" fontWeight="700">
        {max.toFixed(0)}
        {unit ?? ''}
      </text>
      <text x={pad} y={H - 6} fontSize={10} fill="#9a8fc0">{labels[0] ?? ''}</text>
      <text x={W - pad} y={H - 6} fontSize={10} fill="#9a8fc0" textAnchor="end">
        {labels[labels.length - 1] ?? ''}
      </text>
    </svg>
  )
}
