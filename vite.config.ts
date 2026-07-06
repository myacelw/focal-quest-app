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
    },
  }
})
