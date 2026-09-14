import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './ErrorBoundary'
import { harvestVoiceCrash, clearVoicePending } from './speech/voice-guard'
import './index.css'

// —— 语音崩溃自愈：**必须在渲染之前结算** ——
// 上次若是在加载 44MB 语音模型的途中被系统杀掉（白屏 + 状态栏转圈，见 speech/voice-guard.ts），
// 面包屑会留在 localStorage 里；这里记一次账，训练页据此跳过本次自动加载、只留手动重试，
// 免得"进去→白屏→重进→白屏"把孩子锁在死循环里。放在 createRoot 之前，训练页读到的才是新值。
harvestVoiceCrash()
// 正常隐藏/退出（切后台、关 PWA）擦掉面包屑：只有进程被杀才会不留收尾，那才是崩溃信号
window.addEventListener('pagehide', clearVoicePending)

// —— 申请持久化存储 ——
// iOS 对"脚本可写存储"有 7 天未访问就清理的策略，被清掉的后果有两层：
//  ① 44MB 语音模型的离线缓存没了 → 下次开练要重新联网下载，正是白屏那条最吃内存的路；
//  ② **本地训练记录（Dexie）也在清理范围内**——虽然有云同步兜底，但没登录/没联网时就是丢数据。
// 装到主屏的 PWA 申请持久化通常直接获批（iOS 15.4+ 支持），获批后即可免于这轮清理。
// 失败也无所谓：一切照旧，只是缓存可能再被清。不阻塞渲染，静默进行。
if (navigator.storage?.persist) {
  void navigator.storage.persist().catch(() => undefined)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// —— PWA / 跨域隔离引导 ——
// SW 由 vite-plugin-pwa 自动注册（injectRegister:'auto'）。这里只处理“补头刷新一次”：
// 首次打开时 SW 还没接管，文档没有 COOP/COEP → crossOriginIsolated=false → vosk 无法加载。
// 等 SW 接管后刷新一次，让导航文档经过 SW 补上头，从此隔离生效、语音可用。
// dev（localhost/局域网）由 Vite 直接下发头，crossOriginIsolated 本就为 true，不会触发刷新。
if ('serviceWorker' in navigator && !crossOriginIsolated) {
  const reloadOnce = () => {
    if (!crossOriginIsolated && !sessionStorage.getItem('coi-reloaded')) {
      sessionStorage.setItem('coi-reloaded', '1')
      window.location.reload()
    }
  }
  navigator.serviceWorker.addEventListener('controllerchange', reloadOnce)
  void navigator.serviceWorker.ready.then(() => {
    if (navigator.serviceWorker.controller) reloadOnce()
  })
}
