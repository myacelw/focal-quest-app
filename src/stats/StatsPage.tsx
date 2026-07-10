import { useEffect, useState } from 'react'
import { db, type SessionRow } from '../data/db'
import { aggregate, type Dim } from './aggregate'
import { LineChart } from './LineChart'
import { BarChart } from './BarChart'
import { VisionTrendCard } from './VisionTrendCard'
import { weeklyReport } from './weekly-report'
import { toDateStr } from '../data/date-utils'
import { useT } from '../i18n'

export function StatsPage() {
  const t = useT()
  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [dim, setDim] = useState<Dim>('day')

  useEffect(() => {
    db.sessions.toArray().then(setSessions)
  }, [])

  if (sessions === null) return <div className="fq-page">{t('home.loading')}</div>
  if (sessions.length === 0) {
    // 空态也渲染视力趋势卡——家长可能先录了验光记录、孩子还没开始训练
    return (
      <div className="fq-page fq-rise">
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: 46 }}>📊</div>
          <h2 className="fq-h2" style={{ marginTop: 10 }}>{t('stats.empty.title')}</h2>
          <p className="fq-sub">{t('stats.empty.sub')}</p>
        </div>
        <VisionTrendCard />
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
  const report = weeklyReport(sessions, toDateStr(new Date()))
  const trend = report.reactionTrend === 'faster' ? ' ⚡' : report.reactionTrend === 'slower' ? ' ·' : ''

  return (
    <div className="fq-page fq-rise">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h2 className="fq-h2">{t('stats.title')}</h2>
        <div className="fq-seg">
          {(['day', 'week', 'month'] as Dim[]).map((d) => (
            <button key={d} className={dim === d ? 'on' : ''} onClick={() => setDim(d)}>
              {t(`stats.dim.${d}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="fq-card" style={{ marginTop: 16, display: 'flex', alignItems: 'center' }}>
        <div className="fq-stat"><div className="n">{totalCount}</div><div className="l">{t('stats.totalSessions')}</div></div>
        <div style={{ width: 1, height: 36, background: 'var(--line)' }} />
        <div className="fq-stat"><div className="n">{totalMin}</div><div className="l">{t('stats.totalMinutes')}</div></div>
        <div style={{ width: 1, height: 36, background: 'var(--line)' }} />
        <div className="fq-stat"><div className="n">{avgAcc}%</div><div className="l">{t('stats.avgAccuracy')}</div></div>
      </div>

      <div className="fq-card" style={{ marginTop: 14, background: 'linear-gradient(135deg, #7c6cf0, #8b6cff)', border: 'none', color: '#fff', boxShadow: 'var(--shadow)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{t('stats.weekly')}</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
              {report.thisWeekCount}
              <span style={{ fontSize: 12, opacity: 0.85 }}> {t('stats.times')}</span>
            </div>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>
              {t('stats.thisWeek')}{report.lastWeekCount > 0 ? t('stats.lastWeek', { n: report.lastWeekCount }) : ''}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
              {report.avgReactionSec !== null ? `${report.avgReactionSec}s` : '—'}
              {trend}
            </div>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>{t('stats.avgReaction')}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
              {report.accuracy !== null ? `${Math.round(report.accuracy * 100)}%` : '—'}
            </div>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>{t('stats.accuracy')}</div>
          </div>
        </div>
        <div style={{ fontSize: 13, background: 'rgba(255,255,255,0.18)', borderRadius: 10, padding: '9px 12px' }}>
          💡 {t(`stats.${report.suggestionKey}`)}
        </div>
      </div>

      <div className="fq-card" style={{ marginTop: 14 }}>
        <div className="fq-card-title">{t('stats.cpmTrend')}</div>
        <LineChart values={stats.map((s) => Math.round(s.avgCpm))} labels={labels} />
      </div>
      <div className="fq-card" style={{ marginTop: 14 }}>
        <div className="fq-card-title">{t('stats.accTrend')}</div>
        <LineChart values={stats.map((s) => Math.round(s.avgAccuracy * 100))} labels={labels} unit="%" />
      </div>
      <div className="fq-card" style={{ marginTop: 14 }}>
        <div className="fq-card-title">{t('stats.countChart')}</div>
        <BarChart values={stats.map((s) => s.count)} labels={labels} />
      </div>

      <VisionTrendCard />

      <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginTop: 16, textAlign: 'center' }}>
        {t('stats.effectivenessTip')}
      </p>
    </div>
  )
}
