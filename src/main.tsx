import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
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
