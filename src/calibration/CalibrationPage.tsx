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
    <div style={{ padding: 24 }}>
      <h2>屏幕标定</h2>
      <p>把下面的蓝条拖到和一张银行卡（宽 {CARD_WIDTH_MM}mm）一样宽，然后点「保存标定」。</p>
      <div style={{ height: 60, background: '#2b7', width: barPx }} />
      <input
        type="range"
        min={100}
        max={1200}
        value={barPx}
        onChange={(e) => setBarPx(Number(e.target.value))}
        style={{ width: '100%', marginTop: 16 }}
      />
      <p>
        当前条宽：{barPx} CSS px → <b>{ratio.toFixed(3)}</b> px/mm
      </p>
      <button onClick={save} style={{ fontSize: 18, padding: '8px 16px' }}>
        保存标定
      </button>

      {saved !== null && (
        <div style={{ marginTop: 32 }}>
          <p>
            下面方块理论上是 <b>20mm</b>，请拿尺子量（误差应 &lt; 5%，即 19–21mm）：
          </p>
          <div
            style={{
              width: mmToCssPx(20, saved),
              height: mmToCssPx(20, saved),
              background: '#e33',
            }}
          />
        </div>
      )}
    </div>
  )
}
