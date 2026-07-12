// 一键局域网自托管：构建生产版 dist/（关后端、纯离线 PWA）→ 用 HTTPS 在局域网预览。
// iPad 同 WiFi 打开打印出的 https://<电脑IP>:4173 → 首次信任自签证书 → 分享→添加到主屏。
// 装一次后离线可用（SW 缓存 app + 42MB 模型）；更新时重连同一 WiFi 再开一次即可。
//
// 为什么走 preview 而不是 dev:lan：preview 服务真实构建产物，SW/离线/模型分片/跨域隔离
// 与线上 GitHub Pages 完全一致；dev:lan 是开发服务器（HMR、无 SW），行为不同。
//
// 用法：node scripts/serve-lan.mjs   或   npm run lan
import os from 'node:os'
import { build, preview } from 'vite'

const PORT = Number(process.env.PORT ?? 4173)

// 关后端：纯前端 PWA，不发 /api（preview 无 proxy，否则每次存档打一个必然失败的请求）
process.env.VITE_BACKEND = 'off'

function lanIPv4s() {
  const out = []
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address)
    }
  }
  return out
}

console.log('\n▶ 正在构建生产版（关后端、纯离线）…\n')
// mode 'lan' → vite.config 里启用 basicSsl（自签 HTTPS 证书）
await build({ mode: 'lan' })

console.log('\n▶ 启动局域网 HTTPS 预览…\n')
const server = await preview({
  mode: 'lan',
  preview: { host: true, port: PORT, strictPort: false },
})

const ips = lanIPv4s()
console.log('\n' + '='.repeat(56))
console.log('  局域网自托管已就绪（HTTPS）。iPad 同一 WiFi 打开：')
if (ips.length === 0) {
  console.log(`    https://<本机IP>:${PORT}/   （未探测到局域网 IP，手动查电脑 IP）`)
} else {
  for (const ip of ips) console.log(`    https://${ip}:${PORT}/`)
}
console.log('')
console.log('  iPad 首次：')
console.log('   1) Safari 打开上面地址，证书警告点「显示详细信息 → 仍要访问」')
console.log('   2) 底部分享按钮（方框+上箭头）→ 往下划 →「添加到主屏幕」')
console.log('   3) 从主屏图标打开 → 全屏、离线、语音可用')
console.log('  （关掉本窗口即停止；更新后重跑本脚本，孩子重连 WiFi 开一次即更新）')
console.log('='.repeat(56) + '\n')

server.printUrls()
