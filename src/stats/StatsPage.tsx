import { useEffect, useState } from 'react'
import { db, type SessionRow } from '../data/db'
import { aggregate, type Dim } from './aggregate'
import { LineChart } from './LineChart'
import { BarChart } from './BarChart'

const DIM_LABEL: Record<Dim, string> = { day: '日', week: '周', month: '月' }
const cardStyle = { padding: '12px 16px', background: '#f1efe8', borderRadius: 8 } as const

export function StatsPage() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [dim, setDim] = useState<Dim>('day')

  useEffect(() => {
    db.sessions.toArray().then(setSessions)
  }, [])

  if (sessions === null) return <div style={{ padding: 24 }}>加载中…</div>
  if (sessions.length === 0) {
    return (
      <div style={{ padding: 24 }}>
        <h2>统计</h2>
        <p>还没有训练记录，先去练一次吧。</p>
      </div>
    )
  }

  const stats = aggregate(sessions, dim)
  const labels = stats.map((s) => s.label)
  const totalCount = sessions.length
  const totalMin = Math.round(sessions.reduce((a, s) => a + s.elapsedSec, 0) / 60)

  return (
    <div style={{ padding: 24 }}>
      <h2>统计</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['day', 'week', 'month'] as Dim[]).map((d) => (
          <button key={d} onClick={() => setDim(d)} style={{ fontWeight: dim === d ? 700 : 400 }}>
            {DIM_LABEL[d]}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={cardStyle}>累计训练 <b>{totalCount}</b> 节</div>
        <div style={cardStyle}>累计时长 <b>{totalMin}</b> 分钟</div>
      </div>

      <h3>CPM 走势</h3>
      <LineChart values={stats.map((s) => Math.round(s.avgCpm))} labels={labels} />

      <h3>正确率走势</h3>
      <LineChart values={stats.map((s) => Math.round(s.avgAccuracy * 100))} labels={labels} unit="%" />

      <h3>训练次数</h3>
      <BarChart values={stats.map((s) => s.count)} labels={labels} />
    </div>
  )
}
