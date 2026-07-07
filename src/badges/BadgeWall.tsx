import { useEffect, useState } from 'react'
import { db } from '../data/db'
import { BADGES } from './badge-defs'
import { deriveStats, type BadgeStats } from './stats-derive'
import { syncBadges, getUnlockedIds } from './badge-service'
import { BadgeCard } from './BadgeCard'

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

  if (unlocked === null || stats === null) return <div style={{ padding: 24 }}>加载中…</div>

  return (
    <div style={{ padding: 24 }}>
      <h2>勋章墙</h2>
      <p style={{ color: '#666' }}>已解锁 {unlocked.size}/{BADGES.length}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {BADGES.map((def) => (
          <BadgeCard key={def.id} def={def} unlocked={unlocked.has(def.id)} current={stats[def.metric]} />
        ))}
      </div>
    </div>
  )
}
