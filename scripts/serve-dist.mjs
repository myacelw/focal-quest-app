// 裸静态服务器：服务 dist/，故意【不】下发 COOP/COEP 头——真实模拟 GitHub Pages。
// 用途：验证纯静态托管下，Service Worker 能否让 crossOriginIsolated 变 true、vosk 能否加载。
// 零依赖。用法：node scripts/serve-dist.mjs [port]
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const port = Number(process.argv[2]) || 4173

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.woff2': 'font/woff2',
}

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0])
    if (p.endsWith('/')) p += 'index.html'
    let file = normalize(join(root, p))
    if (!file.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return }
    let s
    try { s = await stat(file) } catch { s = null }
    if (!s || s.isDirectory()) {
      // SPA 回退：未知路由回 index.html
      file = join(root, 'index.html')
    }
    const body = await readFile(file)
    const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream'
    // 注意：这里【故意】只设 Content-Type，不设任何 COOP/COEP/CORP，模拟 GitHub Pages。
    res.writeHead(200, { 'Content-Type': type })
    res.end(body)
  } catch (e) {
    res.writeHead(500); res.end(String(e))
  }
}).listen(port, () => {
  console.log(`裸静态服务器（无 COOP/COEP，模拟 GitHub Pages）→ http://localhost:${port}`)
})
