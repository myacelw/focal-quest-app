import { useState } from 'react'
import { HomePage } from './HomePage'
import { CalibrationPage } from './calibration/CalibrationPage'
import { SpeechTestPage } from './speech/SpeechTestPage'
import { TrainingPage } from './training/TrainingPage'
import { StatsPage } from './stats/StatsPage'

type View = 'home' | 'train' | 'stats' | 'calib' | 'speech'

export function App() {
  const [view, setView] = useState<View>('home')
  return (
    <div>
      <nav style={{ display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid #ccc' }}>
        <button onClick={() => setView('home')}>首页</button>
        <button onClick={() => setView('train')}>训练</button>
        <button onClick={() => setView('stats')}>统计</button>
        <button onClick={() => setView('calib')}>标定</button>
        <button onClick={() => setView('speech')}>语音</button>
      </nav>
      {view === 'home' && <HomePage />}
      {view === 'train' && <TrainingPage />}
      {view === 'stats' && <StatsPage />}
      {view === 'calib' && <CalibrationPage />}
      {view === 'speech' && <SpeechTestPage />}
    </div>
  )
}
