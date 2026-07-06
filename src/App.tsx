import { useState } from 'react'
import { CalibrationPage } from './calibration/CalibrationPage'
import { SpeechTestPage } from './speech/SpeechTestPage'
import { TrainingPage } from './training/TrainingPage'

type View = 'home' | 'train' | 'calib' | 'speech'

export function App() {
  const [view, setView] = useState<View>('home')
  return (
    <div>
      <nav style={{ display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid #ccc' }}>
        <button onClick={() => setView('home')}>首页</button>
        <button onClick={() => setView('train')}>训练</button>
        <button onClick={() => setView('calib')}>标定</button>
        <button onClick={() => setView('speech')}>语音</button>
      </nav>
      {view === 'home' && (
        <div style={{ padding: 24 }}>
          <h1>变焦大冒险 · 迭代1a</h1>
          <p>先到「标定」完成一次屏幕标定，再进「训练」。</p>
        </div>
      )}
      {view === 'train' && <TrainingPage />}
      {view === 'calib' && <CalibrationPage />}
      {view === 'speech' && <SpeechTestPage />}
    </div>
  )
}
