import { useEffect, useState } from 'react'
import { monstersOfWorld, TOTAL_MONSTERS, WORLDS, isShinyId, baseIdOf, MONSTER_DEFS, type MonsterDef, type Rarity } from './monster-defs'
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

export function DexWall() {
  const t = useT()
  // id → 捕获时间戳（用对象映射方便按 id 查）
  const [capturedMap, setCapturedMap] = useState<Record<string, number> | null>(null)
  const [zoom, setZoom] = useState<MonsterDef | null>(null)
  const [shinySet, setShinySet] = useState<Set<string>>(new Set())
  // 放大态里当前看的是哪一面；每次打开都从普通面开始
  const [zoomShiny, setZoomShiny] = useState(false)

  useEffect(() => {
    void getOwnedMonsters().then((rows) => {
      const m: Record<string, number> = {}
      for (const r of rows) m[r.id] = r.capturedAt
      setCapturedMap(m)
      const shiny = new Set<string>()
      for (const r of rows) if (isShinyId(r.id)) shiny.add(baseIdOf(r.id))
      setShinySet(shiny)
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

  // 必须遍历 MONSTER_DEFS 来数，不能用 Object.keys(capturedMap).length /
  // shinySet.size——那两个数的是「capturedMap/shinySet 里有多少行」，今天与
  // MONSTER_DEFS 的定义数恒等价（历史上零退役零改名），但只要将来退役/改名一只
  // 怪，或从更新版设备同步回一条本机不认识的 monster 行，行数会被算进去而
  // dex-service.getDexProgress（首页用的那份）不会，两处数字就会打架，且行数可能
  // 超过 TOTAL_MONSTERS 导致 pct > 100%。与首页同源，用法参考 dex-service.ts。
  const ownedCount = MONSTER_DEFS.filter((d) => capturedMap[d.id] !== undefined).length
  const shinyCount = MONSTER_DEFS.filter((d) => shinySet.has(d.id)).length
  const pct = Math.round((ownedCount / TOTAL_MONSTERS) * 100)
  // 本体与闪光都集齐才算「全部集齐」——否则孩子约第 35 天把 82 只本体集齐、
  // 闪光才约 5 只时，图鉴会同时显示「已收集 82/82」「100%」外加「🎉 全部集齐！」，
  // 而本分支想供给的那 77 只闪光其实一只都还没开始，等于本分支的存在理由被自己的 UI 掐掉。
  const isComplete = ownedCount >= TOTAL_MONSTERS && shinyCount >= TOTAL_MONSTERS

  return (
    <div className="fq-rise">
      {/* 总进度卡片 */}
      <div className="fq-card" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
          <span>{t('dex.progress', { n: ownedCount, total: TOTAL_MONSTERS })}</span>
          {shinyCount > 0 && (
            <span style={{ color: '#e0a400' }}>
              {t('dex.shinyProgress', { n: shinyCount, total: TOTAL_MONSTERS })}
            </span>
          )}
          <span style={{ color: 'var(--violet)' }}>{pct}%</span>
        </div>
        <div className="fq-bar"><i style={{ width: `${pct}%` }} /></div>
        {isComplete ? (
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 800, color: 'var(--lemon)', textAlign: 'center' }}>
            {t('dex.complete')}
          </div>
        ) : ownedCount >= TOTAL_MONSTERS ? (
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 800, color: 'var(--lemon)', textAlign: 'center' }}>
            {t('dex.baseComplete', { n: TOTAL_MONSTERS - shinyCount })}
          </div>
        ) : null}
      </div>

      {/* 跳过还没有怪兽的世界：先加世界类型、后补数据时不会多出一个空分组 */}
      {WORLDS.filter((key) => monstersOfWorld(key).length > 0).map((key) => {
        const list = monstersOfWorld(key)
        const ownedInWorld = list.filter((d) => capturedMap[d.id] !== undefined).length
        return (
          <section key={key} style={{ marginTop: 22 }}>
            <div className="fq-card-title" style={{ fontSize: 15 }}>
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
                    shinyOwned={shinySet.has(def.id)}
                    onClick={() => { if (owned) { setZoomShiny(false); setZoom(def) } }}
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
              <MonsterImage def={zoom} shiny={zoomShiny} />
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
            {shinySet.has(zoom.id) && (
              <button
                className="fq-btn"
                style={{ marginTop: 10 }}
                onClick={() => setZoomShiny((v) => !v)}
              >
                {zoomShiny ? t('dex.normalToggle') : t('dex.shinyToggle')}
              </button>
            )}
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

/** 图鉴格子：已捕获显示彩色图+名字+稀有度边框+捕获日期；未捕获显示统一的"神秘格"（？）+？？？ */
function MonsterCard({
  def, owned, capturedAt, shinyOwned, onClick,
}: {
  def: MonsterDef
  owned: boolean
  capturedAt: number | undefined
  shinyOwned: boolean
  onClick: () => void
}) {
  const t = useT()
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        flex: '1 1 108px',
        maxWidth: 132,
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
      {/* 闪光可能先于本体被抽中（两个桶各自独立掷骰，见 capture.ts 的 pickCapture）：
          此时格子仍是未捕获的「？？？」神秘格，不能挂 ✨——挂了会出现一个孩子点不开、
          连名字都看不到的发光神秘格。奖励已经在捕获当下的结算页揭示卡（金边+金色微光+✨+
          'shiny' 音效）里给足了，且顶部「✨ 闪光 N/82」计数立刻 +1，反馈不缺席；
          等本体后来到手，格子会带着 ✨ 一起出现，反而是个惊喜。 */}
      {owned && shinyOwned && (
        <span
          title={t('dex.shiny')}
          style={{ position: 'absolute', top: 4, right: 6, fontSize: 13, filter: 'drop-shadow(0 0 3px rgba(255,200,60,0.9))' }}
        >
          ✨
        </span>
      )}
      {owned ? (
        <div style={{ width: 80, height: 80, margin: '0 auto', borderRadius: 12, overflow: 'hidden', background: '#fafaff' }}>
          <MonsterImage def={def} />
        </div>
      ) : (
        // 未捕获：统一的"神秘格"——柔和薰衣草渐变 + 虚线环 + 大问号，有设计感、不再是难看的黑块
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
