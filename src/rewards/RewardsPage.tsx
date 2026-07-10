import { useEffect, useState } from 'react'
import type { RewardRow, RedemptionRow } from '../data/db'
import { listRewards, getAvailablePoints, requestRedemption, listRedemptions } from './rewards-service'
import { useT } from '../i18n'

export function RewardsPage() {
  const t = useT()
  const [rewards, setRewards] = useState<RewardRow[] | null>(null)
  const [available, setAvailable] = useState(0)
  const [history, setHistory] = useState<RedemptionRow[]>([])

  async function refresh() {
    const [rws, av, hist] = await Promise.all([listRewards(), getAvailablePoints(), listRedemptions()])
    setRewards(rws)
    setAvailable(av)
    setHistory(hist.filter((r) => r.kind === 'reward'))
  }
  useEffect(() => { void refresh() }, [])

  async function onRedeem(r: RewardRow) {
    const ok = await requestRedemption(r.id!)
    if (ok) await refresh()
  }

  if (rewards === null) return <div className="fq-page">{t('home.loading')}</div>

  return (
    <div className="fq-page fq-rise">
      <h2 className="fq-h2">{t('reward.pageTitle')}</h2>

      {/* 可用积分 */}
      <div className="fq-card" style={{ marginTop: 14, textAlign: 'center' }}>
        <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--violet)' }}>{available}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{t('reward.available')}</div>
      </div>

      {/* 奖励列表 */}
      {rewards.length === 0 ? (
        <div className="fq-card" style={{ marginTop: 14, color: 'var(--muted)', fontSize: 13 }}>{t('reward.emptyList')}</div>
      ) : (
        rewards.map((r) => {
          const affordable = available >= r.cost
          return (
            <div key={r.id} className="fq-card" style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: 'var(--violet)', fontWeight: 700 }}>{t('reward.cost', { n: r.cost })}</div>
              </div>
              <button
                className="fq-btn"
                disabled={!affordable}
                onClick={() => void onRedeem(r)}
                style={{ opacity: affordable ? 1 : 0.5 }}
              >
                {affordable ? t('reward.redeem') : t('reward.notEnough')}
              </button>
            </div>
          )
        })
      )}

      {/* 兑换记录 */}
      <div className="fq-card-title" style={{ marginTop: 22, fontSize: 15 }}>{t('reward.history')}</div>
      {history.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>{t('reward.noHistory')}</div>
      ) : (
        history.map((h) => (
          <div key={h.id} className="fq-card" style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span>{h.title}</span>
            <span style={{ color: 'var(--muted)' }}>{t('reward.cost', { n: h.cost })} · {t(`reward.status.${h.status}`)}</span>
          </div>
        ))
      )}
    </div>
  )
}
