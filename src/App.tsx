import { useEffect, useState } from 'react'
import { HomePage } from './HomePage'
import { CalibrationPage } from './calibration/CalibrationPage'
import { SpeechTestPage } from './speech/SpeechTestPage'
import { TrainingPage } from './training/TrainingPage'
import { StatsPage } from './stats/StatsPage'
import { BadgeWall } from './badges/BadgeWall'
import { pushAll } from './data/api'
import { Onboarding } from './Onboarding'
import { SettingsPage } from './SettingsPage'

type View = 'home' | 'train' | 'stats' | 'badges' | 'calib' | 'speech' | 'settings'

const NAV: { key: View; label: string; icon: string }[] = [
  { key: 'home', label: '首页', icon: '🏠' },
  { key: 'train', label: '训练', icon: '🎯' },
  { key: 'stats', label: '统计', icon: '📊' },
  { key: 'badges', label: '勋章', icon: '🏅' },
  { key: 'calib', label: '标定', icon: '📐' },
  { key: 'settings', label: '设置', icon: '⚙️' },
]

export function App() {
  const [view, setView] = useState<View>('home')
  const [showOnboard, setShowOnboard] = useState(() => !localStorage.getItem('fzp.onboarded'))
  // 启动时把本地数据回填到后端（best-effort，后端没开则忽略）
  useEffect(() => { void pushAll() }, [])
  return (
    <div>
      {showOnboard && (
        <Onboarding onDone={() => { localStorage.setItem('fzp.onboarded', '1'); setShowOnboard(false) }} />
      )}
      <nav className="fq-nav">
        {NAV.map((n) => (
          <button key={n.key} className={view === n.key ? 'on' : ''} onClick={() => setView(n.key)}>
            <span aria-hidden>{n.icon}</span>{n.label}
          </button>
        ))}
      </nav>
      {view === 'home' && <HomePage onStart={() => setView('train')} />}
      {view === 'train' && <TrainingPage />}
      {view === 'stats' && <StatsPage />}
      {view === 'badges' && <BadgeWall />}
      {view === 'calib' && <CalibrationPage />}
      {view === 'speech' && <SpeechTestPage />}
      {view === 'settings' && (
        <SettingsPage onReplayGuide={() => setShowOnboard(true)} onOpenSpeech={() => setView('speech')} />
      )}
    </div>
  )
}
