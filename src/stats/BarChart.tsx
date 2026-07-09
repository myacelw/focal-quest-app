import { useT } from '../i18n'

export function BarChart({ values, labels }: { values: number[]; labels: string[] }) {
  const t = useT()
  const W = 320
  const H = 160
  const pad = 28
  if (values.length === 0) return <p style={{ color: 'var(--muted)' }}>{t('chart.noData')}</p>

  const max = Math.max(...values, 1)
  const n = values.length
  const slot = (W - 2 * pad) / n
  const bw = Math.min(slot * 0.6, 30)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('chart.barLabel')} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="bcFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b6cff" />
          <stop offset="100%" stopColor="#6c4bf0" />
        </linearGradient>
      </defs>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#efe7fb" />
      {values.map((v, i) => {
        const h = (v / max) * (H - 2 * pad)
        const bx = pad + i * slot + (slot - bw) / 2
        return <rect key={i} x={bx} y={H - pad - h} width={bw} height={h} rx={4} fill="url(#bcFill)" />
      })}
      <text x={pad} y={pad - 8} fontSize={11} fill="#9a8fc0" fontWeight="700">{max.toFixed(0)}</text>
      <text x={pad} y={H - 6} fontSize={10} fill="#9a8fc0">{labels[0] ?? ''}</text>
      <text x={W - pad} y={H - 6} fontSize={10} fill="#9a8fc0" textAnchor="end">
        {labels[labels.length - 1] ?? ''}
      </text>
    </svg>
  )
}
