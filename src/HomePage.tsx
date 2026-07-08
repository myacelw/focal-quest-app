import { useEffect, useState } from 'react'
import { getHomeStats, type HomeStats } from './data/checkin'
import { toDateStr } from './data/date-utils'

export function HomePage({ onStart }: { onStart: () => void }) {
  const [stats, setStats] = useState<HomeStats | null>(null)

  useEffect(() => {
    getHomeStats(toDateStr(new Date())).then(setStats)
  }, [])

  return (
    <div style={{ padding: '24px 20px 40px', maxWidth: 480, margin: '0 auto' }}>
      <div>
        <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: -0.5 }}>
          变焦<span style={{ color: 'var(--coral)' }}>大冒险</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Focal Quest</div>
      </div>

      {stats === null ? (
        <div className="fq-card" style={{ marginTop: 18 }}>加载中…</div>
      ) : (
        <>
          {/* 打卡卡片：珊瑚渐变高亮，坚持引擎的门面 */}
          <div
            className="fq-card"
            style={{
              marginTop: 18,
              background: 'linear-gradient(135deg, #ff8a5b, #ff5c86)',
              border: 'none',
              color: '#fff',
              boxShadow: 'var(--shadow-coral)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
              {stats.checkedInToday ? '今天练过啦 ✓ 真棒！' : '今天还没练，来一局吧！'}
            </div>
            <div style={{ display: 'flex', gap: 26 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{stats.streak}</div>
                <div style={{ fontSize: 12, opacity: 0.9, marginTop: 5 }}>🔥 连续天数</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{stats.totalPoints}</div>
                <div style={{ fontSize: 12, opacity: 0.9, marginTop: 5 }}>⭐ 累计积分</div>
              </div>
            </div>
          </div>

          <button className="fq-cta" style={{ width: '100%', marginTop: 16 }} onClick={onStart}>
            ▶ 开始今日训练
          </button>

          <p style={{ marginTop: 16, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
            第一次用请先到「📐 标定」完成一次屏幕标定，视标才能按正确大小显示。
          </p>
        </>
      )}
    </div>
  )
}
