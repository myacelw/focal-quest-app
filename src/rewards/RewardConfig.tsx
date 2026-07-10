import { useEffect, useState } from 'react'
import type { RewardRow, RedemptionRow } from '../data/db'
import { listRewards, addReward, deactivateReward, listPending, fulfillRedemption, cancelRedemption } from './rewards-service'
import { useT } from '../i18n'

export function RewardConfig() {
  const t = useT()
  const [rewards, setRewards] = useState<RewardRow[]>([])
  const [pending, setPending] = useState<RedemptionRow[]>([])
  const [title, setTitle] = useState('')
  const [cost, setCost] = useState('')

  async function refresh() {
    setRewards(await listRewards())
    setPending(await listPending())
  }
  useEffect(() => { void refresh() }, [])

  async function onAdd() {
    const c = Number(cost)
    if (!title.trim() || !Number.isFinite(c) || c <= 0) return
    await addReward(title.trim(), Math.floor(c))
    setTitle(''); setCost('')
    await refresh()
  }

  return (
    <div className="fq-card" style={{ marginTop: 14, textAlign: 'left' }}>
      <div className="fq-card-title">{t('reward.config')}</div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 12px' }}>{t('reward.configHint')}</p>

      {/* 添加表单 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('reward.addTitle')} style={{ flex: '1 1 160px', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--line)' }} />
        <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="numeric" placeholder={t('reward.addCost')} style={{ width: 96, padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--line)' }} />
        <button className="fq-btn" onClick={() => void onAdd()}>{t('reward.add')}</button>
      </div>

      {/* 现有奖励 */}
      {rewards.map((r) => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 13 }}>
          <span>{r.title} · {t('reward.cost', { n: r.cost })}</span>
          <button className="fq-btn" onClick={async () => { if (!window.confirm(t('reward.deleteConfirm', { title: r.title }))) return; await deactivateReward(r.id!); await refresh() }}>{t('reward.delete')}</button>
        </div>
      ))}

      {/* 待确认兑换 */}
      <div className="fq-card-title" style={{ marginTop: 18 }}>
        {t('reward.pendingTitle')}{pending.length > 0 ? ` (${pending.length})` : ''}
      </div>
      {pending.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{t('reward.noPending')}</p>
      ) : (
        pending.map((p) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 13, gap: 8 }}>
            <span>{p.title} · {t('reward.cost', { n: p.cost })}</span>
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <button className="fq-btn" onClick={async () => { await fulfillRedemption(p.id!); await refresh() }}>{t('reward.fulfill')}</button>
              <button className="fq-btn" onClick={async () => { await cancelRedemption(p.id!); await refresh() }}>{t('reward.cancelBtn')}</button>
            </span>
          </div>
        ))
      )}
    </div>
  )
}
