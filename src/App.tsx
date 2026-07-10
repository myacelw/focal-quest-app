import { useEffect, useState } from 'react'
import { HomePage } from './HomePage'
import { CalibrationPage } from './calibration/CalibrationPage'
import { SpeechTestPage } from './speech/SpeechTestPage'
import { TrainingPage } from './training/TrainingPage'
import { StatsPage } from './stats/StatsPage'
import { BadgeWall, type DexTab } from './badges/BadgeWall'
import { pushAll } from './data/api'
import { Onboarding } from './Onboarding'
import { SettingsPage } from './SettingsPage'
import { RewardsPage } from './rewards/RewardsPage'
import { lsGet, lsSet } from './data/storage'
import { useT } from './i18n'

type View = 'home' | 'train' | 'stats' | 'badges' | 'calib' | 'speech' | 'settings' | 'rewards'

const NAV: { key: View; icon: string }[] = [
  { key: 'home', icon: '🏠' },
  { key: 'train', icon: '🎯' },
  { key: 'stats', icon: '📊' },
  { key: 'badges', icon: '🏅' },
  { key: 'settings', icon: '⚙️' },
]
// 标定/语音不进常驻导航——都是一次性配置，从「设置」页进入

export function App() {
  const t = useT()
  const [view, setView] = useState<View>('home')
  const [showOnboard, setShowOnboard] = useState(() => !lsGet('fzp.onboarded'))
  // 勋章页初始 tab：首页收集进度卡片点击时设为 'dex' 再跳过去
  const [badgeTab, setBadgeTab] = useState<DexTab>('badges')
  // 启动时把本地数据回填到后端（best-effort，后端没开则忽略）
  useEffect(() => { void pushAll() }, [])
  return (
    <div>
      {showOnboard && (
        <Onboarding onDone={() => { lsSet('fzp.onboarded', '1'); setShowOnboard(false) }} />
      )}
      <nav className="fq-nav">
        {NAV.map((n) => (
          <button key={n.key} className={view === n.key ? 'on' : ''} onClick={() => { setBadgeTab('badges'); setView(n.key) }}>
            <span aria-hidden>{n.icon}</span>{t(`nav.${n.key}`)}
          </button>
        ))}
      </nav>
      {view === 'home' && (
        <HomePage
          onStart={() => setView('train')}
          onOpenDex={() => { setBadgeTab('dex'); setView('badges') }}
          onOpenRewards={() => setView('rewards')}
        />
      )}
      {view === 'train' && <TrainingPage />}
      {view === 'stats' && <StatsPage />}
      {view === 'badges' && <BadgeWall initialTab={badgeTab} />}
      {view === 'calib' && <CalibrationPage />}
      {view === 'speech' && <SpeechTestPage />}
      {view === 'rewards' && <RewardsPage />}
      {view === 'settings' && (
        <SettingsPage
          onReplayGuide={() => setShowOnboard(true)}
          onOpenSpeech={() => setView('speech')}
          onOpenCalib={() => setView('calib')}
        />
      )}
    </div>
  )
}
