import { useEffect, useState } from 'react'
import { db } from '../data/db'
import { BADGES, type Metric } from './badge-defs'
import { deriveStats, type BadgeStats } from './stats-derive'
import { syncBadges, getUnlockedIds } from './badge-service'
import { BadgeCard } from './BadgeCard'

const GROUPS: { metric: Metric; title: string }[] = [
  { metric: 'maxStreak', title: '🔥 连续打卡' },
  { metric: 'totalSessions', title: '🌱 训练积累' },
  { metric: 'totalSec', title: '⏳ 累计时长' },
  { metric: 'maxCpm', title: '⚡ 速度里程碑' },
  { metric: 'maxAccuracy', title: '🎯 精准神眼' },
  { metric: 'totalCorrect', title: '📚 答题收集' },
]

export function BadgeWall() {
  const [unlocked, setUnlocked] = useState<Set<string> | null>(null)
  const [stats, setStats] = useState<BadgeStats | null>(null)

  useEffect(() => {
    ;(async () => {
      await syncBadges(Date.now())
      const [ids, sessions, checkins] = await Promise.all([
        getUnlockedIds(),
        db.sessions.toArray(),
        db.checkins.toArray(),
      ])
      setUnlocked(ids)
      setStats(deriveStats(sessions, checkins))
    })()
  }, [])

  if (unlocked === null || stats === null) return <div className="fq-page">加载中…</div>

  const pct = Math.round((unlocked.size / BADGES.length) * 100)

  return (
    <div className="fq-page fq-rise">
      <h2 className="fq-h2">🏅 勋章墙</h2>

      <div className="fq-card" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
          <span>已解锁 {unlocked.size} / {BADGES.length}</span>
          <span style={{ color: 'var(--violet)' }}>{pct}%</span>
        </div>
        <div className="fq-bar"><i style={{ width: `${pct}%` }} /></div>
      </div>

      {GROUPS.map((g) => (
        <section key={g.metric} style={{ marginTop: 22 }}>
          <div className="fq-card-title" style={{ fontSize: 15 }}>{g.title}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {BADGES.filter((b) => b.metric === g.metric).map((def) => (
              <BadgeCard key={def.id} def={def} unlocked={unlocked.has(def.id)} current={stats[def.metric]} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
