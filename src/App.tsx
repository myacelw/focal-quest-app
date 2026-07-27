import { lazy, Suspense, useEffect, useState } from 'react'
import { HomePage } from './HomePage'
import { CalibrationPage } from './calibration/CalibrationPage'
import { SpeechTestPage } from './speech/SpeechTestPage'
import { TrainingPage } from './training/TrainingPage'
import { StatsPage } from './stats/StatsPage'
import { BadgeWall, type DexTab } from './badges/BadgeWall'
import { Onboarding } from './Onboarding'
import { SettingsPage } from './SettingsPage'
import { RewardsPage } from './rewards/RewardsPage'
import { PrivacyPage } from './PrivacyPage'
import { ChallengePage } from './challenge/ChallengePage'
import { listPending } from './rewards/rewards-service'
import { lsGet, lsSet } from './data/storage'
import { startSync } from './sync/engine'
import { ErrorBoundary } from './ErrorBoundary'
import { useT } from './i18n'

/**
 * 管理后台只有站长会打开一次，首屏不该为它解析/执行这段代码 → 懒加载。
 * 全仓此前没有 React.lazy 先例（唯一的代码分割是 vosk 的动态 import），
 * 所以下面渲染处自带 Suspense fallback；保持项目的命名导出风格，用 .then 映射成 default。
 *
 * ⚠️ 注意"不进主包"≠"不下发"：vite.config.ts 的 injectManifest.globPatterns 第一条就是
 * `**\/*.{js,css,html}`，所以 AdminPage-*.js 一定会进 SW 的 precache manifest、孩子那台
 * iPad 装 PWA 时照样下载。这是有意的——正因为预缓存了，装好之后离线也能打开管理页。
 * lazy 真正省下的是**首屏解析与执行**（以及首屏字节），不是"所有人都不下载"。
 */
const AdminPage = lazy(() => import('./admin/AdminPage').then((m) => ({ default: m.AdminPage })))

type View = 'home' | 'train' | 'stats' | 'badges' | 'calib' | 'speech' | 'settings' | 'rewards' | 'privacy' | 'admin' | 'challenge'

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
  // 待确认兑换数量：挂载及每次切视图刷新（驱动设置导航红点）
  const [pendingCount, setPendingCount] = useState(0)
  useEffect(() => { void listPending().then((p) => setPendingCount(p.length)) }, [view])
  // 启动即同步一次；引擎自己挂 online 监听与入队钩子。
  // 没登录 / 断网 / 后端挂了都只是静默跳过，训练照常（全量重推只在登录与恢复备份时做）。
  // 返回 startSync 的清理函数：StrictMode 下 effect 会跑两次，否则 online 监听会叠加。
  useEffect(() => startSync(), [])
  return (
    <div className="fq-app">
      {showOnboard && (
        <Onboarding onDone={() => { lsSet('fzp.onboarded', '1'); setShowOnboard(false) }} />
      )}
      <nav className="fq-nav">
        {NAV.map((n) => (
          <button
            key={n.key}
            className={view === n.key ? 'on' : ''}
            aria-label={t(`nav.${n.key}`)}
            onClick={() => { setBadgeTab('badges'); setView(n.key) }}
          >
            <span aria-hidden style={{ position: 'relative' }}>
              {n.icon}
              {n.key === 'settings' && pendingCount > 0 && (
                <span style={{ position: 'absolute', top: -2, right: -6, width: 8, height: 8, borderRadius: '50%', background: '#ff4d4f' }} />
              )}
            </span>
            {/* 手机窄屏隐藏文案只留图标（aria-label 兜住无障碍），导航才不折行 */}
            <span className="fq-nav-label">{t(`nav.${n.key}`)}</span>
          </button>
        ))}
      </nav>
      <main className="fq-app-main">
        {view === 'home' && (
          <HomePage
            onStart={() => setView('train')}
            onOpenDex={() => { setBadgeTab('dex'); setView('badges') }}
            onOpenRewards={() => setView('rewards')}
            onOpenChallenge={() => setView('challenge')}
          />
        )}
        {/* onHome：不达标结算页的「回首页」次按钮。注意**不要**加 key——用重挂载来"重来"
            会 stop 掉 vosk 再重启，正是换眼白屏那条内存尖峰路径（见 TrainingPage.restartRound） */}
        {view === 'train' && <TrainingPage onHome={() => setView('home')} />}
        {view === 'stats' && <StatsPage />}
        {view === 'badges' && <BadgeWall initialTab={badgeTab} />}
        {view === 'calib' && <CalibrationPage />}
        {view === 'speech' && <SpeechTestPage />}
        {view === 'rewards' && <RewardsPage />}
        {view === 'privacy' && <PrivacyPage onBack={() => setView('settings')} />}
        {/* 挑战页不进 NAV：入口只在首页"当天已练完"时出现（spec §7），与 privacy 同构 */}
        {view === 'challenge' && <ChallengePage onBack={() => setView('home')} />}
        {/* ErrorBoundary 不是装饰：React.lazy 的 import 一旦 reject（部署换了 hash 后旧
            chunk 404、Safari 回收缓存后离线首次点进来、SW 还没完成 precache），拒绝会在
            渲染期抛出，而全仓唯一的错误边界在 main.tsx 里包着整个 <App/>——那就变成
            首页与训练一起显示全屏 😵，直接违反"admin 挂了不影响训练"。
            这里就地兜住：出错只糊掉 <main> 里这一块，fq-nav 在 <main> 之外仍可点、
            切走即恢复（view 变了这个 boundary 就整体卸载、state 归零）。
            前车之鉴：commit 06b7de6「服务器停止后 iPad 离线训练白屏」。 */}
        {view === 'admin' && (
          <ErrorBoundary>
            <Suspense fallback={<div className="fq-page">{t('admin.loading')}</div>}>
              <AdminPage />
            </Suspense>
          </ErrorBoundary>
        )}
        {view === 'settings' && (
          <SettingsPage
            onReplayGuide={() => setShowOnboard(true)}
            onOpenSpeech={() => setView('speech')}
            onOpenCalib={() => setView('calib')}
            onOpenPrivacy={() => setView('privacy')}
            onOpenAdmin={() => setView('admin')}
          />
        )}
      </main>
    </div>
  )
}
