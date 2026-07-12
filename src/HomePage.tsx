import { useEffect, useState } from 'react'
import { getHomeStats, type HomeStats } from './data/checkin'
import { toDateStr } from './data/date-utils'
import { SKINS, isSkinUnlocked, getSkinId, setSkinId, RANDOM_SKIN_ID } from './skins/registry'
import { useCountUp } from './useCountUp'
import { asset } from './data/asset'
import { getDexProgress, type DexProgress } from './dex/dex-service'
import { getAvailablePoints, getRepairStatus, doRepair, type RepairStatus } from './rewards/rewards-service'
import { useT } from './i18n'

export function HomePage({ onStart, onOpenDex, onOpenRewards }: { onStart: () => void; onOpenDex: () => void; onOpenRewards: () => void }) {
  const t = useT()
  const [stats, setStats] = useState<HomeStats | null>(null)
  const [dex, setDex] = useState<DexProgress | null>(null)
  const [available, setAvailable] = useState<number | null>(null)
  const [repair, setRepair] = useState<RepairStatus | null>(null)
  const [skinSel, setSkinSel] = useState(() => getSkinId())

  useEffect(() => {
    const today = toDateStr(new Date())
    getHomeStats(today).then(setStats)
    void getDexProgress().then(setDex)
    void getAvailablePoints().then(setAvailable)
    void getRepairStatus(today).then(setRepair)
  }, [])

  const tp = stats?.totalPoints ?? 0
  const streakN = useCountUp(stats?.streak ?? 0)
  const pointsN = useCountUp(tp)

  return (
    <div className="fq-home">
      <div className="fq-home-blobs" aria-hidden />
      <div
        className="fq-home-content"
        style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 20px 44px', maxWidth: 440, margin: '0 auto', textAlign: 'center' }}
      >
        {/* 英雄区：主视觉轻轻浮动 */}
        <div className="fq-rise">
          <img
            src={asset('/hero.webp')}
            alt="变焦大冒险 · FocalQuest"
            className="fq-float"
            style={{ width: '100%', maxWidth: 264, display: 'block', margin: '2px auto 8px', borderRadius: 20, boxShadow: '0 18px 40px -14px rgba(124,108,240,.5)' }}
          />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>{t('home.tagline')}</div>
        </div>

        {/* 今日状态 */}
        <div className="fq-rise" style={{ fontSize: 15, fontWeight: 800, color: stats?.checkedInToday ? 'var(--mint)' : 'var(--ink)', animationDelay: '0.05s' }}>
          {stats?.checkedInToday ? t('home.checkedToday') : t('home.notYetToday')}
        </div>

        {/* 主行动：开始训练——呼吸光晕聚焦，一眼可点、不等数据加载 */}
        <div className="fq-rise" style={{ position: 'relative', animationDelay: '0.08s' }}>
          <div
            className="fq-startglow"
            aria-hidden
            style={{ position: 'absolute', inset: '-8px -6px', borderRadius: 28, background: 'linear-gradient(90deg, var(--violet), var(--coral))', filter: 'blur(20px)', zIndex: 0 }}
          />
          <button
            className="fq-cta"
            onClick={onStart}
            style={{ position: 'relative', zIndex: 1, width: '100%', fontSize: 22, fontWeight: 800, padding: '22px', borderRadius: 20, gap: 12 }}
          >
            {t('home.start')}
          </button>
        </div>

        {/* 训练前快速选皮肤（含随机）——就在开始按钮下方，不用进设置 */}
        <div className="fq-rise" style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center', animationDelay: '0.1s' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{t('home.skinPick')}</span>
          {SKINS.map((s) => {
            const on = isSkinUnlocked(s.id, tp)
            const sel = skinSel === s.id
            return (
              <button
                key={s.id}
                className="fq-chip"
                disabled={!on}
                onClick={() => { setSkinId(s.id); setSkinSel(s.id) }}
                style={{
                  cursor: on ? 'pointer' : 'not-allowed', fontWeight: 700, border: '1.5px solid transparent',
                  background: sel ? 'var(--violet)' : 'var(--chip-bg)', color: sel ? '#fff' : 'var(--violet)',
                  opacity: on ? 1 : 0.5,
                }}
              >
                {on ? '' : '🔒 '}{t(`skin.${s.id}`)}
              </button>
            )
          })}
          <button
            className="fq-chip"
            onClick={() => { setSkinId(RANDOM_SKIN_ID); setSkinSel(RANDOM_SKIN_ID) }}
            style={{
              cursor: 'pointer', fontWeight: 700, border: '1.5px solid transparent',
              background: skinSel === RANDOM_SKIN_ID ? 'var(--coral)' : 'var(--chip-bg)',
              color: skinSel === RANDOM_SKIN_ID ? '#fff' : 'var(--coral)',
            }}
          >
            {t('skin.random')}
          </button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, margin: '-4px 0 0' }}>{t('home.calibHint')}</p>

        {/* 补签横幅：仅恰好漏 1 天时出现 */}
        {repair?.ok && (
          <div className="fq-card fq-rise" style={{ border: '1.5px solid var(--coral)', background: 'linear-gradient(135deg, #fff4ec, #fff)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{t('repair.banner', { cost: repair.cost, streak: repair.streak })}</div>
            <button
              className="fq-cta coral"
              style={{ width: '100%' }}
              onClick={async () => {
                const ok = await doRepair(toDateStr(new Date()))
                if (ok) {
                  const today = toDateStr(new Date())
                  setStats(await getHomeStats(today))
                  setRepair(await getRepairStatus(today))
                  setAvailable(await getAvailablePoints())
                }
              }}
            >
              {t('repair.do')}
            </button>
          </div>
        )}
        {repair && !repair.ok && repair.reason === 'no-points' && (
          <div className="fq-card" style={{ color: 'var(--muted)', fontSize: 13 }}>{t('repair.noPoints', { cost: repair.cost })}</div>
        )}
        {repair && !repair.ok && repair.reason === 'month-limit' && (
          <div className="fq-card" style={{ color: 'var(--muted)', fontSize: 13 }}>{t('repair.monthLimit')}</div>
        )}

        {/* 成绩小药丸：连续 / 累计 / 可用 */}
        <div className="fq-rise" style={{ display: 'flex', gap: 10, animationDelay: '0.12s' }}>
          <StatPill emoji="🔥" value={streakN} label={t('home.streak').replace('🔥 ', '')} tint="var(--coral)" />
          <StatPill emoji="⭐" value={pointsN} label={t('reward.total')} tint="var(--violet)" />
          <StatPill emoji="💎" value={available ?? '—'} label={t('reward.available')} tint="var(--mint)" />
        </div>

        {/* 入口：图鉴 | 奖励（两列，省纵向空间） */}
        <div className="fq-rise" style={{ display: 'flex', gap: 12, animationDelay: '0.16s' }}>
          <button
            onClick={onOpenDex}
            className="fq-card"
            style={{ flex: 1, textAlign: 'left', cursor: 'pointer', border: '1.5px solid var(--violet)', background: 'linear-gradient(160deg, #f3efff, #fff)', padding: 14 }}
          >
            <div style={{ fontSize: 20 }}>📖</div>
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4 }}>{t('dex.tab.dex').replace('📖 ', '')}</div>
            <div style={{ fontSize: 12, color: 'var(--violet)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
              {dex ? `${dex.owned}/${dex.total}` : '—'}
            </div>
            <div className="fq-bar" style={{ marginTop: 8 }}>
              <i style={{ width: `${dex ? Math.round((dex.owned / dex.total) * 100) : 0}%` }} />
            </div>
          </button>

          <button
            onClick={onOpenRewards}
            className="fq-card"
            style={{ flex: 1, textAlign: 'left', cursor: 'pointer', border: '1.5px solid var(--coral)', background: 'linear-gradient(160deg, #fff2ec, #fff)', padding: 14 }}
          >
            <div style={{ fontSize: 20 }}>🎁</div>
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4 }}>{t('reward.homeCard').replace('🎁 ', '')}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>{t('reward.homeCardHint')}</div>
            <div style={{ fontSize: 13, color: 'var(--coral)', fontWeight: 800, marginTop: 8 }}>→</div>
          </button>
        </div>

      </div>
    </div>
  )
}

/** 首页成绩小药丸：emoji + 大数字 + 小标签 */
function StatPill({ emoji, value, label, tint }: { emoji: string; value: number | string; label: string; tint: string }) {
  return (
    <div style={{ flex: '1 1 0', minWidth: 0, background: '#fff', border: '1px solid var(--line)', borderRadius: 18, padding: '12px 6px', boxShadow: 'var(--shadow)' }}>
      <div style={{ fontSize: 17 }}>{emoji}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tint, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
    </div>
  )
}
