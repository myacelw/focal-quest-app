import { useState, useEffect } from 'react'
import { mmToCssPx, CARD_WIDTH_MM } from './calibration-math'
import {
  CARD_SHORT_MM, MIN_CARD_PX, maxCardPx, pickCardEdge,
  ratioFromCardPx, cardPxFromRatio, canSave,
} from './calibration-fit'
import { lsSet } from '../data/storage'
import { readPxPerMm, LS_PX_PER_MM } from './px-per-mm'
import { useT, Rich } from '../i18n'

const STORAGE_KEY = LS_PX_PER_MM
/** 银行卡 ISO/IEC 7810 ID-1：85.6 × 53.98 mm，宽高比约 1.586 */
const CARD_ASPECT = CARD_WIDTH_MM / CARD_SHORT_MM
/** 短边模式的参照带高度：卡片竖放比屏幕还高，只需对齐左右两边，故不画整张卡 */
const SHORT_BAND_H = 190

export function CalibrationPage() {
  const t = useT()
  // 可用宽度（视口宽，排除滚动条）——滑块/拖拽上限随之，杜绝溢出裁切
  const [avail, setAvail] = useState(360)
  const [cardPx, setCardPx] = useState(300)
  // ⚠️ 必须走 readPxPerMm 而不是自己 `Number(lsGet(...))`：脏值（'abc' → NaN、'0'、'1e6'）
  // 会一路传到 `canSave` → `cardPxFromRatio`，那里 `if (!(ratio > 0)) throw`，整个标定页在
  // 渲染期抛异常、被全局 ErrorBoundary 变成全屏 😵。而这一页正是其它三页在拿到脏值时
  // 唯一推荐的康复路径——它自己崩掉的话，孩子就再也练不了、家长也无法重新标定。
  const [saved, setSaved] = useState<number | null>(readPxPerMm)

  useEffect(() => {
    const measure = () => setAvail(document.documentElement.clientWidth)
    measure()
    const ro = new ResizeObserver(measure) // 比 window.resize 更可靠（旋转/视口变化都触发）
    ro.observe(document.documentElement)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  // 窄屏用卡片短边当参照（长边根本放不下，硬凑会把 px/mm 低估 33%）
  const edge = pickCardEdge(avail)

  // 已有存档时按当前参照边还原参照带宽度；旋转设备切换长/短边也会重算
  useEffect(() => {
    if (saved === null) return
    setCardPx(Math.round(cardPxFromRatio(saved, edge)))
  }, [edge, saved])

  const minPx = MIN_CARD_PX
  const maxPx = maxCardPx(avail)
  const w = Math.min(Math.max(cardPx, minPx), maxPx)
  const ratio = ratioFromCardPx(w, edge)
  const saveOk = canSave(avail, edge, saved)
  // 已存值在这块屏上够不到 → 页面显示的是被截断的值，必须警告且不许保存
  const mismatch = saved !== null && !saveOk

  function setW(px: number) {
    setCardPx(Math.min(Math.max(px, minPx), maxPx))
  }

  // 直接拖右下角手柄：卡框右边缘跟随手指/指针
  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const cardEl = e.currentTarget.parentElement as HTMLElement
    const move = (ev: PointerEvent) => {
      const rect = cardEl.getBoundingClientRect()
      setW(Math.round(ev.clientX - rect.left))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function save() {
    if (!saveOk) return
    lsSet(STORAGE_KEY, String(ratio))
    setSaved(ratio)
  }

  const bandH = edge === 'long' ? Math.round(w / CARD_ASPECT) : SHORT_BAND_H

  return (
    <div className="fq-page fq-rise">
      <h2 className="fq-h2">{t('calib.title')}</h2>
      <p className="fq-sub">
        {edge === 'long'
          ? t('calib.instruction', { mm: CARD_WIDTH_MM })
          : <Rich text={t('calib.instructionShort', { mm: CARD_SHORT_MM })} />}
      </p>

      {/* 全宽参照带：冲破 fq-page 的 460px 上限、用测得视口宽（非 100vw，避开滚动条溢出），卡框永不溢出/滚动 */}
      <div
        style={{ width: avail, position: 'relative', left: '50%', transform: 'translateX(-50%)', marginTop: 16, padding: '4px 0 4px 16px', boxSizing: 'border-box' }}
      >
        <div style={{ position: 'relative', width: w, height: bandH }}>
          <div
            style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(135deg, var(--violet), var(--violet-2))',
              borderRadius: 10, boxShadow: 'var(--shadow)',
              display: 'grid', placeItems: 'center', color: '#fff', fontSize: 13, fontWeight: 700,
              textAlign: 'center', padding: '0 10px',
            }}
          >
            💳 {edge === 'long' ? t('calib.cardHint') : t('calib.edgeShort')}
          </div>
          {/* 右边缘拖拽手柄（触控友好，touchAction none 防误滚） */}
          <div
            onPointerDown={onDragStart}
            style={{ position: 'absolute', top: 0, right: -12, width: 24, height: '100%', cursor: 'ew-resize', touchAction: 'none', display: 'grid', placeItems: 'center' }}
          >
            <div style={{ width: 8, height: 44, borderRadius: 6, background: 'var(--violet)', boxShadow: 'var(--shadow)' }} />
          </div>
        </div>
      </div>

      {edge === 'short' && (
        <div className="fq-card" style={{ marginTop: 14, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          <Rich text={t('calib.shortEdgeWhy')} />
        </div>
      )}

      <div className="fq-card" style={{ marginTop: 16 }}>
        <input
          type="range"
          min={minPx}
          max={maxPx}
          value={w}
          onChange={(e) => setW(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--violet)' }}
        />
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          {t('calib.barWidth', { px: w })}<b style={{ color: 'var(--violet)' }}>{ratio.toFixed(3)}</b> px/mm
          <span className="fq-chip" style={{ marginLeft: 8, fontSize: 11 }}>{t(edge === 'long' ? 'calib.edgeLong' : 'calib.edgeShort')}</span>
        </p>
        {mismatch && (
          <p style={{ fontSize: 13, color: 'var(--coral)', marginTop: 8, lineHeight: 1.6 }}>
            <Rich text={t('calib.savedMismatch', { v: saved!.toFixed(3) })} />
          </p>
        )}
        <button
          className="fq-cta"
          style={{ width: '100%', marginTop: 8, opacity: saveOk ? 1 : 0.45 }}
          onClick={save}
          disabled={!saveOk}
        >
          {t('calib.save')}
        </button>
        {!saveOk && (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.6 }}>{t('calib.cantSave')}</p>
        )}
        {saved !== null && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <span className="fq-chip" style={{ background: '#e8f9f0', color: '#1d9e75' }}>
              {t('calib.saved', { v: saved.toFixed(3) })}
            </span>
          </div>
        )}
      </div>

      {saved !== null && (
        <div className="fq-card" style={{ marginTop: 14, textAlign: 'center' }}>
          <div className="fq-card-title" style={{ justifyContent: 'center' }}>{t('calib.verifyTitle')}</div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            <Rich text={t('calib.verifyBody')} />
          </p>
          <div
            style={{
              width: mmToCssPx(20, saved),
              height: mmToCssPx(20, saved),
              background: 'linear-gradient(135deg, #ff8a5b, #ff5c86)',
              borderRadius: 8,
              margin: '0 auto',
              boxShadow: 'var(--shadow-coral)',
            }}
          />
        </div>
      )}
    </div>
  )
}
