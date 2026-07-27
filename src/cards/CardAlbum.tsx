import { useEffect, useState } from 'react'
import { CARD_SETS, type CardDef, type CardRarity } from './card-defs'
import { PACK_COST } from './pack'
import { CardImage } from './CardImage'
import { getOwnedCards, getSetProgress, openPack, type SetProgress } from './cards-service'
import { getAvailablePoints } from '../rewards/rewards-service'
import { playSfx } from '../training/sfx'
import { toDateStr } from '../data/date-utils'
import { useT } from '../i18n'

/** 稀有度 → 边框色 + 光晕（沿用图鉴/勋章那套：普通银灰、稀有紫、闪卡金） */
const RARITY_BORDER: Record<CardRarity, string> = {
  common: '#c7c0db',
  rare: '#7c6cf0',
  shiny: '#ffb400',
}
const RARITY_GLOW: Record<CardRarity, string> = {
  common: 'rgba(199,192,219,0.35)',
  rare: 'rgba(124,108,240,0.42)',
  shiny: 'rgba(255,180,0,0.48)',
}

type T = (key: string, params?: Record<string, string | number>) => string

/**
 * 卡名。正式卡名随卡图一起补，缺失时 `translate` 会原样返回 key，
 * 此时回落到「套名 #编号」，界面上不会出现 'card.pony.07' 这种字样。
 */
function cardName(def: CardDef, t: T): string {
  const s = t(def.nameKey)
  if (s !== def.nameKey) return s
  return `${t(`card.set.${def.setId}`)} #${def.id.replace(`${def.setId}-`, '')}`
}

export function CardAlbum() {
  const t = useT()
  const [progress, setProgress] = useState<SetProgress[] | null>(null)
  const [obtainedMap, setObtainedMap] = useState<Record<string, number>>({})
  const [available, setAvailable] = useState(0)
  const [zoom, setZoom] = useState<CardDef | null>(null)
  const [got, setGot] = useState<CardDef | null>(null)
  const [busy, setBusy] = useState(false)

  async function refresh(): Promise<void> {
    const [prog, owned, av] = await Promise.all([getSetProgress(), getOwnedCards(), getAvailablePoints()])
    const m: Record<string, number> = {}
    for (const r of owned) m[r.id] = r.obtainedAt
    setProgress(prog)
    setObtainedMap(m)
    setAvailable(av)
  }
  useEffect(() => { void refresh() }, [])

  // 放大卡 / 开包结果都能用 ESC 关
  useEffect(() => {
    if (!zoom && !got) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setZoom(null); setGot(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom, got])

  // busy 期间按钮禁用：孩子连点两次会并发读到同一个余额（余额校验纯在本地做）
  async function onOpen(setId: string): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      const res = await openPack(setId, Date.now())
      if (res.ok) {
        setGot(res.card)
        await refresh()
        // 音效**放在界面反馈之后**：AudioContext 万一抛错（iOS 在非用户手势的上下文里会），
        // 排在前面会连带吞掉"获得新卡"弹窗与进度刷新——卡已经落库了，却什么反馈都没有。
        playSfx(res.card.rarity === 'shiny' ? 'shiny' : 'badge')
      }
    } finally {
      setBusy(false)
    }
  }

  if (progress === null) return <div className="fq-page">{t('home.loading')}</div>

  const allComplete = progress.every((p) => p.complete)

  return (
    <div className="fq-page fq-rise">
      <h2 className="fq-h2">{t('card.pageTitle')}</h2>

      <div className="fq-card" style={{ marginTop: 14, textAlign: 'center' }}>
        <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--violet)' }}>{available}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{t('reward.available')}</div>
      </div>

      {allComplete && (
        <div className="fq-card" style={{ marginTop: 12, textAlign: 'center', fontSize: 15, fontWeight: 800, color: 'var(--lemon)' }}>
          {t('card.allComplete')}
        </div>
      )}

      {CARD_SETS.map((set) => {
        const prog = progress.find((p) => p.setId === set.id)!
        const pct = Math.round((prog.owned / prog.total) * 100)
        const affordable = available >= PACK_COST
        return (
          <section key={set.id} style={{ marginTop: 22 }}>
            <div className="fq-card-title" style={{ fontSize: 15 }}>
              <span>{t(set.nameKey)}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                {t('card.progress', { n: prog.owned, total: prog.total })}
              </span>
            </div>

            <div className="fq-bar" style={{ marginTop: 8 }}><i style={{ width: `${pct}%` }} /></div>

            <button
              className="fq-cta"
              style={{ width: '100%', marginTop: 12, opacity: prog.complete || !affordable || busy ? 0.55 : 1 }}
              disabled={prog.complete || !affordable || busy}
              onClick={() => void onOpen(set.id)}
            >
              {prog.complete
                ? t('card.complete')
                : affordable
                  ? t('card.open', { cost: PACK_COST })
                  : t('card.notEnough', { n: PACK_COST - available })}
            </button>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
              {set.cards.map((def) => {
                const at = obtainedMap[def.id]
                const owned = at !== undefined
                return (
                  <div
                    key={def.id}
                    onClick={() => owned && setZoom(def)}
                    title={owned ? cardName(def, t) : t('card.locked')}
                    style={{
                      flex: '1 1 96px',
                      maxWidth: 120,
                      padding: '10px 8px',
                      borderRadius: 16,
                      textAlign: 'center',
                      background: '#fff',
                      border: owned ? `1.5px solid ${RARITY_BORDER[def.rarity]}` : '1px solid var(--line)',
                      boxShadow: owned ? `0 8px 16px -8px ${RARITY_GLOW[def.rarity]}` : 'none',
                      cursor: owned ? 'pointer' : 'default',
                    }}
                  >
                    {owned ? (
                      <div style={{ width: 80, height: 80, margin: '0 auto', overflow: 'hidden', borderRadius: 12, background: '#fafaff' }}>
                        <CardImage def={def} size={80} />
                      </div>
                    ) : (
                      // 未获得：柔和薰衣草渐变 + 虚线环 + 大问号（与图鉴的"神秘格"同款观感）
                      <div style={{
                        width: 80, height: 80, margin: '0 auto', borderRadius: 12,
                        display: 'grid', placeItems: 'center',
                        background: 'linear-gradient(135deg, #f4effe, #ece4fb)',
                        border: '2px dashed #d8ccf3',
                        color: '#c0b2ea', fontSize: 34, fontWeight: 800,
                      }}>?</div>
                    )}
                    <div style={{
                      fontSize: 12, marginTop: 6, fontWeight: 700,
                      color: owned ? 'var(--ink)' : 'var(--muted)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {owned ? cardName(def, t) : t('card.locked')}
                    </div>
                    <div style={{
                      fontSize: 10, marginTop: 2, fontWeight: owned ? 700 : 400,
                      color: owned ? RARITY_BORDER[def.rarity] : 'var(--muted)',
                    }}>
                      {owned ? t(`card.rarity.${def.rarity}`) : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      {/* 开包结果 */}
      {got && <CardModal def={got} caption={t('card.got')} onClose={() => setGot(null)} />}

      {/* 放大看已拥有的卡 */}
      {zoom && (
        <CardModal
          def={zoom}
          caption={t('card.obtainedAt', { date: toDateStr(new Date(obtainedMap[zoom.id]!)) })}
          onClose={() => setZoom(null)}
        />
      )}
    </div>
  )
}

/** 开包结果与放大看卡共用同一个 modal，只有底部那行说明文字不同 */
function CardModal({ def, caption, onClose }: { def: CardDef; caption: string; onClose: () => void }) {
  const t = useT()
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(51,40,90,0.55)', backdropFilter: 'blur(6px)',
        display: 'grid', placeItems: 'center', padding: 20,
      }}
    >
      <div
        className="fq-card fq-rise"
        onClick={(e) => e.stopPropagation()}
        style={{
          textAlign: 'center', padding: 24, maxWidth: 320,
          border: `2px solid ${RARITY_BORDER[def.rarity]}`,
          boxShadow: `0 18px 36px -12px ${RARITY_GLOW[def.rarity]}`,
        }}
      >
        <div style={{
          width: 240, height: 240, margin: '0 auto', maxWidth: '100%',
          borderRadius: 18, overflow: 'hidden',
          border: `2px solid ${RARITY_BORDER[def.rarity]}`, background: '#fff',
        }}>
          <CardImage def={def} size={240} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 14, color: 'var(--ink)' }}>
          {cardName(def, t)}
        </div>
        <div style={{
          display: 'inline-block', marginTop: 8, padding: '3px 12px',
          fontSize: 12, fontWeight: 700, borderRadius: 99,
          color: '#fff', background: RARITY_BORDER[def.rarity],
        }}>
          {t(`card.rarity.${def.rarity}`)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>{caption}</div>
        <button className="fq-btn" style={{ marginTop: 16, width: '100%' }} onClick={onClose}>✓</button>
      </div>
    </div>
  )
}
