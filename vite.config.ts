import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

// 仅声明用到的 process.env，避免为一个配置文件引入整个 @types/node
declare const process: { env: Record<string, string | undefined> }

// 部署 base：GitHub 项目页在子路径下（如 /focal-quest-app/），构建时传 VITE_BASE 覆盖。
// 本机 dev / 根路径部署保持 '/'。
const BASE = process.env.VITE_BASE || '/'
// 可见的构建版本号：设置页展示，父亲一眼确认孩子那台更没更到最新。
const BUILD_STAMP = new Date().toISOString().slice(0, 16).replace('T', ' ')

// vosk 依赖 SharedArrayBuffer → 需要跨域隔离（COOP+COEP），再给资源加 CORP 满足 require-corp。
// dev/preview 由服务器直接下发；线上静态托管由 Service Worker 补（见 src/sw.ts）。
const COI_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
}

export default defineConfig(({ mode }) => {
  // iPad 经局域网 IP 访问需 https：用 `npm run dev:lan`（mode=lan）启用自签证书。
  const useHttps = mode === 'lan'
  return {
    base: BASE,
    define: {
      __APP_VERSION__: JSON.stringify(BUILD_STAMP),
    },
    plugins: [
      react(),
      ...(useHttps ? [basicSsl()] : []),
      VitePWA({
        strategies: 'injectManifest', // 用我们自己的 src/sw.ts（既离线缓存又补跨域隔离头）
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate', // 新版本自动接管：孩子联网打开一次即更新
        injectRegister: 'auto',
        injectManifest: {
          // 预缓存首屏 shell + 勋章图；排除 42MB 模型和皮肤大图（由 SW 运行时按需缓存）
          globPatterns: ['**/*.{js,css,html}', 'badges/*.webp'],
          globIgnores: ['**/models/**', '**/skins/**'],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // 容纳 vosk 那个 5.7MB 动态 chunk
        },
        manifest: {
          name: '变焦大冒险 · FocalQuest',
          short_name: '变焦大冒险',
          description: '翻转拍视力训练游戏——有节奏、音效、打卡积分的 iPad 训练',
          lang: 'zh-CN',
          theme_color: '#6c4bf0',
          background_color: '#faf7ff',
          display: 'standalone',
          start_url: '.',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        devOptions: { enabled: false }, // dev 用 Vite 直接下发头，不需要 SW
      }),
    ],
    server: {
      host: true,
      port: 5173,
      headers: COI_HEADERS,
      proxy: { '/api': 'http://localhost:3001' }, // iPad 只连 Vite，/api 转发本地 Node 后端，免 CORS
    },
    preview: {
      headers: COI_HEADERS,
    },
  }
})
