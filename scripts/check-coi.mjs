/**
 * 检查一个部署（本地 wrangler pages dev 或线上）是否下发跨域隔离三件套。
 * 用法：node scripts/check-coi.mjs http://127.0.0.1:8788
 * 退出码 0 = 首页与子资源都带全 COOP/COEP/CORP；1 = 有缺失（打印明细）。
 */
const base = process.argv[2] || 'http://127.0.0.1:8788'

const WANT = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'cross-origin',
}

async function checkOne(url) {
  const res = await fetch(url)
  const missing = []
  for (const [k, v] of Object.entries(WANT)) {
    const got = res.headers.get(k)
    if (got !== v) missing.push(`${k}: 期望 ${v}，实际 ${got ?? '(无)'}`)
  }
  return { url, status: res.status, missing }
}

// 从首页 HTML 里挑一个真实子资源（构建产物带 hash，不能写死文件名）
async function findAsset() {
  const html = await (await fetch(base + '/')).text()
  const m = html.match(/(?:src|href)="([^"]*\/assets\/[^"]+\.(?:js|css))"/)
  return m ? new URL(m[1], base).href : null
}

const targets = [base + '/']
const asset = await findAsset()
if (asset) targets.push(asset)
else console.warn('警告：首页里没找到 /assets/ 子资源，只检查首页')

let bad = 0
for (const t of targets) {
  const r = await checkOne(t)
  if (r.missing.length) {
    bad++
    console.error(`✗ ${r.url} (HTTP ${r.status})`)
    for (const m of r.missing) console.error('   ' + m)
  } else {
    console.log(`✓ ${r.url} (HTTP ${r.status}) 三头齐全`)
  }
}
console.log(bad === 0 ? '全部通过' : `${bad} 个目标缺头`)
// 用 process.exitCode 而非 process.exit()：Node 24 + Windows 下，undici 的 keep-alive
// 连接还在时强行 process.exit() 会触发 libuv 断言崩溃（uv async.c:76），退出码变 127，
// 使"退出码 0/1"的契约失效。设 exitCode 让进程自然退出，实测同样即时（<100ms）。
process.exitCode = bad === 0 ? 0 : 1
