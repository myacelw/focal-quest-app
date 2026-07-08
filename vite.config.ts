import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig(({ mode }) => {
  // 默认 http：本机 localhost 已是浏览器认可的安全上下文，麦克风/语音可用，
  // 也便于本机浏览器/预览测试。
  // iPad 经局域网 IP 访问需 https：用 `npm run dev:lan`（mode=lan）启用自签证书。
  const useHttps = mode === 'lan'
  return {
    plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
    server: {
      host: true,
      port: 5173,
      // vosk-browser 依赖 SharedArrayBuffer，必须开启 cross-origin isolation（COOP + COEP），
      // 否则 SharedArrayBuffer 为 undefined、vosk 模型加载失败 → 语音识别根本起不来。
      // 同时给所有响应加 CORP，让同源子资源（模型/皮肤图/模块）满足 COEP require-corp，不被拦。
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
      // iPad 只连 Vite；/api 由 Vite 转发到本地 Node 后端（server/），免 CORS
      proxy: {
        '/api': 'http://localhost:3001',
      },
    },
  }
})
