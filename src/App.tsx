import { useState } from 'react'
import { CalibrationPage } from './calibration/CalibrationPage'

type View = 'home' | 'calib' | 'speech'

export function App() {
  const [view, setView] = useState<View>('home')
  return (
    <div>
      <nav style={{ display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid #ccc' }}>
        <button onClick={() => setView('home')}>首页</button>
        <button onClick={() => setView('calib')}>标定</button>
        <button onClick={() => setView('speech')}>语音</button>
      </nav>
      {view === 'home' && (
        <div style={{ padding: 24 }}>
          <h1>翻转拍 · 迭代0 技术验证</h1>
          <p>环境自检：</p>
          <ul>
            <li>innerWidth × innerHeight：{window.innerWidth} × {window.innerHeight}</li>
            <li>devicePixelRatio：{window.devicePixelRatio}</li>
            <li>UserAgent：{navigator.userAgent}</li>
          </ul>
        </div>
      )}
      {view === 'calib' && <CalibrationPage />}
      {view === 'speech' && <div style={{ padding: 24 }}>（语音页将在 Task 3 接入）</div>}
    </div>
  )
}
