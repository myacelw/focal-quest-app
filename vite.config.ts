import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// server.host=true 暴露到局域网；basicSsl 提供自签 HTTPS（麦克风所需的安全上下文）
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    port: 5173,
  },
})
