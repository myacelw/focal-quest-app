import { useState, useEffect } from 'react'
import { cssPxPerMm, mmToCssPx, CARD_WIDTH_MM } from './calibration-math'
import { lsGet, lsSet } from '../data/storage'
import { useT, Rich } from '../i18n'

const STORAGE_KEY = 'fzp.cssPxPerMm'
/** 银行卡 ISO/IEC 7810 ID-1：85.6 × 53.98 mm，宽高比约 1.586 */
const CARD_HEIGHT_MM = 53.98
const CARD_ASPECT = CARD_WIDTH_MM / CARD_HEIGHT_MM

export function CalibrationPage() {
  const t = useT()
  // 可用宽度（视口宽，排除滚动条）——滑块/拖拽上限随之，杜绝溢出裁切
  const [avail, setAvail] = useState(360)
  // 卡框宽度（CSS px）。有存档则由已存比值还原上次卡宽，否则默认 300
  const [cardPx, setCardPx] = useState(() => {
    const v = lsGet(STORAGE_KEY)
    return v ? Math.round(Number(v) * CARD_WIDTH_MM) : 300
  })
  const [saved, setSaved] = useState<number | null>(() => {
    const v = lsGet(STORAGE_KEY)
    return v ? Number(v) : null
  })

  useEffect(() => {
    const measure = () => setAvail(document.documentElement.clientWidth)
    measure()
    const ro = new ResizeObserver(measure) // 比 window.resize 更可靠（旋转/视口变化都触发）
    ro.observe(document.documentElement)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  const minPx = 150
  const maxPx = Math.max(minPx + 10, Math.floor(avail - 30)) // 留出右侧手柄空间
  const w = Math.min(Math.max(cardPx, minPx), maxPx)
  const ratio = cssPxPerMm(w)

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
    lsSet(STORAGE_KEY, String(ratio))
    setSaved(ratio)
  }

  return (
    <div className="fq-page fq-rise">
      <h2 className="fq-h2">{t('calib.title')}</h2>
      <p className="fq-sub">{t('calib.instruction', { mm: CARD_WIDTH_MM })}</p>

      {/* 全宽参照带：冲破 fq-page 的 460px 上限、用测得视口宽（非 100vw，避开滚动条溢出），卡框永不溢出/滚动 */}
      <div
        style={{ width: avail, position: 'relative', left: '50%', transform: 'translateX(-50%)', marginTop: 16, padding: '4px 0 4px 16px', boxSizing: 'border-box' }}
      >
        <div style={{ position: 'relative', width: w, height: Math.round(w / CARD_ASPECT) }}>
          <div
            style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(135deg, var(--violet), var(--violet-2))',
              borderRadius: 10, boxShadow: 'var(--shadow)',
              display: 'grid', placeItems: 'center', color: '#fff', fontSize: 13, fontWeight: 700,
            }}
          >
            💳 {t('calib.cardHint')}
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
        </p>
        <button className="fq-cta" style={{ width: '100%', marginTop: 8 }} onClick={save}>
          {t('calib.save')}
        </button>
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
