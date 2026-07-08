import { useState } from 'react'
import { cssPxPerMm, mmToCssPx, CARD_WIDTH_MM } from './calibration-math'

const STORAGE_KEY = 'fzp.cssPxPerMm'

export function CalibrationPage() {
  const [barPx, setBarPx] = useState(300)
  const [saved, setSaved] = useState<number | null>(() => {
    const v = localStorage.getItem(STORAGE_KEY)
    return v ? Number(v) : null
  })

  const ratio = cssPxPerMm(barPx)

  function save() {
    localStorage.setItem(STORAGE_KEY, String(ratio))
    setSaved(ratio)
  }

  return (
    <div className="fq-page fq-rise">
      <h2 className="fq-h2">📐 屏幕标定</h2>
      <p className="fq-sub">
        把下面的紫条拖到和一张银行卡（宽 {CARD_WIDTH_MM}mm）一样宽，再点保存——这样视标才能按正确的物理尺寸显示。
      </p>

      <div className="fq-card" style={{ marginTop: 16 }}>
        <div
          style={{
            height: 56,
            width: barPx,
            maxWidth: '100%',
            background: 'linear-gradient(90deg, var(--violet), var(--violet-2))',
            borderRadius: 10,
            boxShadow: 'var(--shadow)',
          }}
        />
        <input
          type="range"
          min={100}
          max={1200}
          value={barPx}
          onChange={(e) => setBarPx(Number(e.target.value))}
          style={{ width: '100%', marginTop: 16, accentColor: 'var(--violet)' }}
        />
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          当前条宽 {barPx} px → <b style={{ color: 'var(--violet)' }}>{ratio.toFixed(3)}</b> px/mm
        </p>
        <button className="fq-cta" style={{ width: '100%', marginTop: 8 }} onClick={save}>
          💾 保存标定
        </button>
        {saved !== null && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <span className="fq-chip" style={{ background: '#e8f9f0', color: '#1d9e75' }}>
              ✓ 已保存（{saved.toFixed(3)} px/mm）
            </span>
          </div>
        )}
      </div>

      {saved !== null && (
        <div className="fq-card" style={{ marginTop: 14, textAlign: 'center' }}>
          <div className="fq-card-title" style={{ justifyContent: 'center' }}>📏 拿尺子验一下</div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            下面方块理论上是 <b>20mm</b>，量一量应在 19–21mm（误差 &lt; 5%）
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
