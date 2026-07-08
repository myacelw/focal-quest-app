// 一键启动：同时拉起 SQLite 后端 + Vite(局域网 https)，Ctrl+C 一起停。
// 零第三方依赖，用 Node 内置 child_process。需 Node 24+。
import { spawn, spawnSync } from 'node:child_process'
import os from 'node:os'

function localIP() {
  const all = []
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal) all.push(i.address)
    }
  }
  // 优先常见家庭/办公局域网网段，避开虚拟网卡/特殊网段（如 198.18.x 基准测试段）
  return (
    all.find((a) => a.startsWith('192.168.')) ||
    all.find((a) => a.startsWith('10.')) ||
    all.find((a) => /^172\.(1[6-9]|2\d|3[01])\./.test(a)) ||
    all[0] ||
    'localhost'
  )
}

const procs = []
let shuttingDown = false

// Windows 上 shell 子进程会派生进程树，p.kill() 杀不干净 → 用 taskkill /T 杀整棵树
function killTree(p) {
  if (!p || !p.pid) return
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'])
    } else {
      p.kill()
    }
  } catch { /* ignore */ }
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const p of procs) killTree(p)
  process.exit(code)
}

// 启动前清掉占着端口的旧残留进程（上次没停干净时会留下），保证每次 npm start 都能干净起来
function freePort(port) {
  if (process.platform !== 'win32') return
  try {
    const out = spawnSync('cmd', ['/c', `netstat -ano | findstr LISTENING | findstr :${port}`], { encoding: 'utf8' }).stdout || ''
    const pids = new Set()
    for (const line of out.split('\n')) {
      const parts = line.trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (/^\d+$/.test(pid)) pids.add(pid)
    }
    for (const pid of pids) spawnSync('taskkill', ['/pid', pid, '/T', '/F'])
  } catch { /* ignore */ }
}

function run(name, cmd, args) {
  const p = spawn(cmd, args, { shell: true })
  const tag = `[${name}]`
  p.stdout.on('data', (d) => process.stdout.write(`${tag} ${d}`))
  p.stderr.on('data', (d) => process.stderr.write(`${tag} ${d}`))
  p.on('exit', (c) => {
    console.log(`${tag} 已退出 (code ${c})`)
    shutdown(c ?? 0)
  })
  procs.push(p)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

const ip = localIP()
console.log('\n🚀 变焦大冒险 · 一键启动中…')
console.log(`📱 iPad 打开：  https://${ip}:5173   （首次需信任自签证书）`)
console.log('💻 电脑打开：  http://localhost:5173')
console.log('⏹  停止：按 Ctrl+C（两个服务会一起停）\n')

freePort(3001)
freePort(5173)

run('后端', 'node', ['--experimental-sqlite', 'server/index.ts'])
run('Vite', 'npm', ['run', 'dev:lan'])
