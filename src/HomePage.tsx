import { useEffect, useState } from 'react'
import { getHomeStats, type HomeStats } from './data/checkin'
import { toDateStr } from './data/date-utils'
import { SKINS, skinUnlockCost, isSkinUnlocked } from './skins/registry'
import { useCountUp } from './useCountUp'
import { asset } from './data/asset'

export function HomePage({ onStart }: { onStart: () => void }) {
  const [stats, setStats] = useState<HomeStats | null>(null)

  useEffect(() => {
    getHomeStats(toDateStr(new Date())).then(setStats)
  }, [])

  const tp = stats?.totalPoints ?? 0
  const streakN = useCountUp(stats?.streak ?? 0)
  const pointsN = useCountUp(tp)
  const locked = SKINS.filter((s) => !isSkinUnlocked(s.id, tp))
  const nextCost = locked.length ? Math.min(...locked.map((s) => skinUnlockCost(s.id))) : 0
  const progress = nextCost ? Math.min(1, tp / nextCost) : 1

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 57px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 16,
        padding: '28px 20px',
        maxWidth: 440,
        margin: '0 auto',
        textAlign: 'center',
      }}
    >
      {/* 英雄区：主视觉 banner + 标语 */}
      <div>
        <img
          src={asset('/hero.webp')}
          alt="变焦大冒险 · FocalQuest"
          style={{
            width: '100%',
            maxWidth: 360,
            display: 'block',
            margin: '0 auto 12px',
            borderRadius: 22,
            boxShadow: '0 16px 36px -12px rgba(124,108,240,.42)',
          }}
        />
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginTop: 2 }}>
          每天几分钟，练出好视力 ✨
        </div>
      </div>

      {stats === null ? (
        <div className="fq-card">加载中…</div>
      ) : (
        <>
          {/* 打卡卡片 */}
          <div
            className="fq-card"
            style={{
              background: 'linear-gradient(135deg, #ff8a5b, #ff5c86)',
              border: 'none',
              color: '#fff',
              boxShadow: 'var(--shadow-coral)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
              {stats.checkedInToday ? '今天练过啦 ✓ 真棒！' : '今天还没练，来一局吧！'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 26 }}>
              <div>
                <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{streakN}</div>
                <div style={{ fontSize: 12, opacity: 0.92, marginTop: 6 }}>🔥 连续天数</div>
              </div>
              <div style={{ width: 1, height: 42, background: '#ffffff55' }} />
              <div>
                <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{pointsN}</div>
                <div style={{ fontSize: 12, opacity: 0.92, marginTop: 6 }}>⭐ 累计积分</div>
              </div>
            </div>
          </div>

          {/* 皮肤解锁进度 */}
          <div className="fq-card" style={{ textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10, fontWeight: 600 }}>
              <span>{locked.length ? '皮肤解锁进度' : '全部皮肤已解锁 🎉'}</span>
              {locked.length > 0 && (
                <span style={{ color: 'var(--muted)' }}>
                  {tp} / {nextCost}
                </span>
              )}
            </div>
            <div className="fq-bar">
              <i style={{ width: `${progress * 100}%` }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {SKINS.map((s) => {
                const on = isSkinUnlocked(s.id, tp)
                return (
                  <span key={s.id} className="fq-chip" style={{ opacity: on ? 1 : 0.5 }}>
                    {on ? '' : '🔒 '}
                    {s.name}
                  </span>
                )
              })}
            </div>
          </div>

          <button className="fq-cta" style={{ width: '100%', fontSize: 20, padding: '20px' }} onClick={onStart}>
            ▶ 开始今日训练
          </button>

          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
            第一次用请先到「📐 标定」完成一次屏幕标定
          </p>
        </>
      )}
    </div>
  )
}
