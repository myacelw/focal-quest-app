import { useT } from '../i18n'

/** 双线折线图：左右眼视力趋势（a=左眼紫 / b=右眼珊瑚），共用 y 标尺 */
export function DualLineChart({ a, b, labels, legendA, legendB }: {
  a: number[]; b: number[]; labels: string[]; legendA: string; legendB: string
}) {
  const t = useT()
  const W = 320
  const H = 170
  const pad = 28
  if (a.length === 0) return <p style={{ color: 'var(--muted)' }}>{t('chart.noData')}</p>

  const all = [...a, ...b]
  const max = Math.max(...all, 1)
  const min = Math.min(...all, 0)
  const range = max - min || 1
  const n = a.length
  const x = (i: number) => (n === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1))
  const y = (v: number) => H - pad - ((v - min) / range) * (H - 2 * pad)
  const pts = (vs: number[]) => vs.map((v, i) => `${x(i)},${y(v)}`).join(' ')

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('chart.lineLabel')} style={{ display: 'block' }}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#efe7fb" />
      <polyline points={pts(a)} fill="none" stroke="#6c4bf0" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={pts(b)} fill="none" stroke="#ff8a5b" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {a.map((v, i) => <circle key={`a${i}`} cx={x(i)} cy={y(v)} r={3} fill="#fff" stroke="#6c4bf0" strokeWidth={2} />)}
      {b.map((v, i) => <circle key={`b${i}`} cx={x(i)} cy={y(v)} r={3} fill="#fff" stroke="#ff8a5b" strokeWidth={2} />)}
      <text x={pad} y={pad - 10} fontSize={11} fill="#6c4bf0" fontWeight="700">● {legendA}</text>
      <text x={pad + 64} y={pad - 10} fontSize={11} fill="#ff8a5b" fontWeight="700">● {legendB}</text>
      <text x={W - pad} y={pad - 10} fontSize={11} fill="#9a8fc0" textAnchor="end">{max.toFixed(1)}</text>
      <text x={pad} y={H - 6} fontSize={10} fill="#9a8fc0">{labels[0] ?? ''}</text>
      <text x={W - pad} y={H - 6} fontSize={10} fill="#9a8fc0" textAnchor="end">{labels[labels.length - 1] ?? ''}</text>
    </svg>
  )
}
