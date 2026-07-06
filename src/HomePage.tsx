import { useEffect, useState } from 'react'
import { getHomeStats, type HomeStats } from './data/checkin'
import { toDateStr } from './data/date-utils'

export function HomePage() {
  const [stats, setStats] = useState<HomeStats | null>(null)

  useEffect(() => {
    getHomeStats(toDateStr(new Date())).then(setStats)
  }, [])

  return (
    <div style={{ padding: 24 }}>
      <h1>变焦大冒险</h1>
      <div
        style={{
          margin: '16px 0',
          padding: 20,
          border: '0.5px solid #ccc',
          borderRadius: 12,
          maxWidth: 360,
        }}
      >
        {stats === null ? (
          <p>加载中…</p>
        ) : (
          <>
            <p style={{ fontSize: 20, margin: '0 0 8px' }}>
              {stats.checkedInToday ? '今天练过啦 ✓' : '今天还没练'}
            </p>
            <p style={{ margin: 0, color: '#1d9e75' }}>
              🔥 连续 {stats.streak} 天 · ⭐ 累计 {stats.totalPoints} 分
            </p>
          </>
        )}
      </div>
      <p>先到「标定」完成一次屏幕标定，再进「训练」。</p>
    </div>
  )
}
