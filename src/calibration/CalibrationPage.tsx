import { useState } from 'react'
import { cssPxPerMm, mmToCssPx, CARD_WIDTH_MM } from './calibration-math'
import { lsGet, lsSet } from '../data/storage'
import { useT, Rich } from '../i18n'

const STORAGE_KEY = 'fzp.cssPxPerMm'

export function CalibrationPage() {
  const t = useT()
  const [barPx, setBarPx] = useState(300)
  const [saved, setSaved] = useState<number | null>(() => {
    const v = lsGet(STORAGE_KEY)
    return v ? Number(v) : null
  })

  const ratio = cssPxPerMm(barPx)

  function save() {
    lsSet(STORAGE_KEY, String(ratio))
    setSaved(ratio)
  }

  return (
    <div className="fq-page fq-rise">
      <h2 className="fq-h2">{t('calib.title')}</h2>
      <p className="fq-sub">
        {t('calib.instruction', { mm: CARD_WIDTH_MM })}
      </p>

      <div className="fq-card" style={{ marginTop: 16 }}>
        {/* 条必须能显示真实像素宽度以对齐银行卡；超出卡片时容器内横向滚动，不加 maxWidth 裁切 */}
        <div style={{ overflowX: 'auto', margin: '0 -18px', padding: '4px 18px' }}>
          <div
            style={{
              height: 56,
              width: barPx,
              background: 'linear-gradient(90deg, var(--violet), var(--violet-2))',
              borderRadius: 10,
              boxShadow: 'var(--shadow)',
            }}
          />
        </div>
        <input
          type="range"
          min={100}
          max={1200}
          value={barPx}
          onChange={(e) => setBarPx(Number(e.target.value))}
          style={{ width: '100%', marginTop: 16, accentColor: 'var(--violet)' }}
        />
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          {t('calib.barWidth', { px: barPx })}<b style={{ color: 'var(--violet)' }}>{ratio.toFixed(3)}</b> px/mm
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
