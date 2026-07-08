import { useEffect, useState } from 'react'
import { db, type SessionRow } from '../data/db'
import { aggregate, type Dim } from './aggregate'
import { LineChart } from './LineChart'
import { BarChart } from './BarChart'

const DIM_LABEL: Record<Dim, string> = { day: '日', week: '周', month: '月' }

export function StatsPage() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [dim, setDim] = useState<Dim>('day')

  useEffect(() => {
    db.sessions.toArray().then(setSessions)
  }, [])

  if (sessions === null) return <div className="fq-page">加载中…</div>
  if (sessions.length === 0) {
    return (
      <div className="fq-page fq-rise" style={{ textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 46 }}>📊</div>
        <h2 className="fq-h2" style={{ marginTop: 10 }}>还没有统计</h2>
        <p className="fq-sub">先去练一次，这里就会出现你的 CPM、正确率走势啦。</p>
      </div>
    )
  }

  const stats = aggregate(sessions, dim)
  const labels = stats.map((s) => s.label)
  const totalCount = sessions.length
  const totalMin = Math.round(sessions.reduce((a, s) => a + s.elapsedSec, 0) / 60)
  const avgAcc = Math.round(
    (sessions.reduce((a, s) => a + (s.answered ? s.correct / s.answered : 0), 0) / sessions.length) * 100,
  )

  return (
    <div className="fq-page fq-rise">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h2 className="fq-h2">📊 统计</h2>
        <div className="fq-seg">
          {(['day', 'week', 'month'] as Dim[]).map((d) => (
            <button key={d} className={dim === d ? 'on' : ''} onClick={() => setDim(d)}>
              {DIM_LABEL[d]}
            </button>
          ))}
        </div>
      </div>

      <div className="fq-card" style={{ marginTop: 16, display: 'flex', alignItems: 'center' }}>
        <div className="fq-stat"><div className="n">{totalCount}</div><div className="l">累计节数</div></div>
        <div style={{ width: 1, height: 36, background: 'var(--line)' }} />
        <div className="fq-stat"><div className="n">{totalMin}</div><div className="l">累计分钟</div></div>
        <div style={{ width: 1, height: 36, background: 'var(--line)' }} />
        <div className="fq-stat"><div className="n">{avgAcc}%</div><div className="l">平均正确率</div></div>
      </div>

      <div className="fq-card" style={{ marginTop: 14 }}>
        <div className="fq-card-title">📈 CPM 走势</div>
        <LineChart values={stats.map((s) => Math.round(s.avgCpm))} labels={labels} />
      </div>
      <div className="fq-card" style={{ marginTop: 14 }}>
        <div className="fq-card-title">🎯 正确率走势</div>
        <LineChart values={stats.map((s) => Math.round(s.avgAccuracy * 100))} labels={labels} unit="%" />
      </div>
      <div className="fq-card" style={{ marginTop: 14 }}>
        <div className="fq-card-title">📅 训练次数</div>
        <BarChart values={stats.map((s) => s.count)} labels={labels} />
      </div>
    </div>
  )
}
