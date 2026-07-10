import { useEffect, useState } from 'react'
import { monstersOfWorld, TOTAL_MONSTERS, type MonsterDef, type World, type Rarity } from './monster-defs'
import { MonsterImage } from './MonsterImage'
import { getOwnedMonsters } from './dex-service'
import { toDateStr } from '../data/date-utils'
import { useT } from '../i18n'

/** 稀有度 → 边框色 + 背景光（复用勋章墙稀有度边框风格：普通银灰、稀有紫、史诗金） */
const RARITY_BORDER: Record<Rarity, string> = {
  common: '#c7c0db',
  rare: '#7c6cf0',
  epic: '#ffb400',
}
const RARITY_GLOW: Record<Rarity, string> = {
  common: 'rgba(199,192,219,0.35)',
  rare: 'rgba(124,108,240,0.42)',
  epic: 'rgba(255,180,0,0.48)',
}

const WORLDS: { key: World; icon: string }[] = [
  { key: 'space', icon: '🚀' },
  { key: 'shrine', icon: '🏛' },
]

export function DexWall() {
  const t = useT()
  // id → 捕获时间戳（用对象映射方便按 id 查）
  const [capturedMap, setCapturedMap] = useState<Record<string, number> | null>(null)
  const [zoom, setZoom] = useState<MonsterDef | null>(null)

  useEffect(() => {
    void getOwnedMonsters().then((rows) => {
      const m: Record<string, number> = {}
      for (const r of rows) m[r.id] = r.capturedAt
      setCapturedMap(m)
    })
  }, [])

  // 放大卡片：点空白或 ESC 关闭
  useEffect(() => {
    if (!zoom) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom])

  if (capturedMap === null) return <div className="fq-page">{t('home.loading')}</div>

  const ownedCount = Object.keys(capturedMap).length
  const pct = Math.round((ownedCount / TOTAL_MONSTERS) * 100)
  const isComplete = ownedCount >= TOTAL_MONSTERS

  return (
    <div className="fq-rise">
      {/* 总进度卡片 */}
      <div className="fq-card" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
          <span>{t('dex.progress', { n: ownedCount, total: TOTAL_MONSTERS })}</span>
          <span style={{ color: 'var(--violet)' }}>{pct}%</span>
        </div>
        <div className="fq-bar"><i style={{ width: `${pct}%` }} /></div>
        {isComplete && (
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 800, color: 'var(--lemon)', textAlign: 'center' }}>
            {t('dex.complete')}
          </div>
        )}
      </div>

      {/* 按世界分组 */}
      {WORLDS.map(({ key, icon }) => {
        const list = monstersOfWorld(key)
        const ownedInWorld = list.filter((d) => capturedMap[d.id] !== undefined).length
        return (
          <section key={key} style={{ marginTop: 22 }}>
            <div className="fq-card-title" style={{ fontSize: 15 }}>
              <span>{icon}</span>
              <span>{t(`dex.world.${key}`)}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                {ownedInWorld}/{list.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {list.map((def) => {
                const capturedAt = capturedMap[def.id]
                const owned = capturedAt !== undefined
                return (
                  <MonsterCard
                    key={def.id}
                    def={def}
                    owned={owned}
                    capturedAt={capturedAt}
                    onClick={() => owned && setZoom(def)}
                  />
                )
              })}
            </div>
          </section>
        )
      })}

      {/* 放大卡片 modal */}
      {zoom && (
        <div
          onClick={() => setZoom(null)}
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
              textAlign: 'center', padding: 24, maxWidth: 300,
              border: `2px solid ${RARITY_BORDER[zoom.rarity]}`,
              boxShadow: `0 18px 36px -12px ${RARITY_GLOW[zoom.rarity]}`,
            }}
          >
            <div style={{
              width: 160, height: 160, margin: '0 auto',
              borderRadius: 18, overflow: 'hidden',
              border: `2px solid ${RARITY_BORDER[zoom.rarity]}`,
              background: '#fff',
            }}>
              <MonsterImage def={zoom} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 14, color: 'var(--ink)' }}>
              {t(zoom.nameKey)}
            </div>
            <div style={{
              display: 'inline-block', marginTop: 8, padding: '3px 12px',
              fontSize: 12, fontWeight: 700, borderRadius: 99,
              color: '#fff', background: RARITY_BORDER[zoom.rarity],
            }}>
              {t(`dex.rarity.${zoom.rarity}`)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
              {t('dex.capturedAt', { date: toDateStr(new Date(capturedMap[zoom.id]!)) })}
            </div>
            <button className="fq-btn" style={{ marginTop: 16, width: '100%' }} onClick={() => setZoom(null)}>
              ✓
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** 图鉴格子：已捕获显示彩色图+名字+稀有度边框+捕获日期；未捕获黑色剪影+？？？ */
function MonsterCard({
  def, owned, capturedAt, onClick,
}: {
  def: MonsterDef
  owned: boolean
  capturedAt: number | undefined
  onClick: () => void
}) {
  const t = useT()
  return (
    <div
      onClick={onClick}
      style={{
        width: 108,
        padding: '10px 8px',
        borderRadius: 16,
        textAlign: 'center',
        background: '#fff',
        border: owned ? `1.5px solid ${RARITY_BORDER[def.rarity]}` : '1px solid var(--line)',
        boxShadow: owned ? `0 8px 16px -8px ${RARITY_GLOW[def.rarity]}` : 'none',
        cursor: owned ? 'pointer' : 'default',
      }}
      title={owned ? t(def.nameKey) : t('dex.locked')}
    >
      <div style={{
        width: 80, height: 80, margin: '0 auto',
        borderRadius: 12, overflow: 'hidden',
        background: owned ? '#fafaff' : '#2a2540',
        // 未捕获：黑色剪影——保留形状轮廓但不露色
        opacity: owned ? 1 : 0.85,
      }}>
        <MonsterImage def={def} filter={owned ? undefined : 'brightness(0)'} />
      </div>
      <div style={{
        fontSize: 12, marginTop: 6, fontWeight: 700,
        color: owned ? 'var(--ink)' : 'var(--muted)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {owned ? t(def.nameKey) : t('dex.locked')}
      </div>
      <div style={{
        fontSize: 10, marginTop: 2,
        color: owned ? RARITY_BORDER[def.rarity] : 'var(--muted)',
        fontWeight: owned ? 700 : 400,
      }}>
        {owned ? t(`dex.rarity.${def.rarity}`) : ''}
      </div>
      {owned && (
        <div style={{ fontSize: 10, marginTop: 2, color: 'var(--muted)' }}>
          {toDateStr(new Date(capturedAt!))}
        </div>
      )}
    </div>
  )
}
