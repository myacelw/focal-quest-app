// 把「AI 画出来的透明棋盘格」抠掉：颜色候选 + 从边界连通泛洪。
//
// 为什么不用全局 fuzz 替换（历史上试过、失败）：棋盘由两种灰组成，跨越它俩要 ~22% fuzz，
// 而神庙那批石头怪本身就是那个灰度，全局替换会把整只怪一起吃掉。
// 这里的关键是**只删「从画布边界能连通走到」的候选像素**——石头怪的躯干被自己的深色描边
// 圈在里面，走不到边界，因此天然免疫。
//
// 用法: node scripts/dekey-checkerboard.mjs <in> <out.png> [--tol=N] [--chroma=N] [--feather=N] [--debug]
//
// 什么时候需要它：某批 AI 出图的提示词里写了「透明背景」。模型画不出真 alpha，于是
// 把「透明」的视觉约定——灰白棋盘格——当成内容**画了出来**。这类图没有 alpha 通道，
// 贴到浅色界面上就是一块灰方块。预防办法见 docs/怪兽出图提示词.md（改让它铺纯品红），
// 但对已经上线、孩子已经收集过的旧图不能重出——换图等于把她认识的怪换掉，只能修复。
//
// --chroma 的取值（无法自动判定，实测过）：
//   10（默认）——通用。石头怪那类灰色躯干必须用它，调高会把躯干啃出白洞。
//   32          ——只给「大辉光、无清晰剪影」的那几只（黑洞/引力球/彗星/陨石/太阳蛾/虚空蛇）。
//                 它们的辉光压在棋盘格交界上会混出偏色锯齿，色相不够中性、进不了候选带，
//                 在白底图鉴上留一圈暗环；调高容差才洗得掉，而它们没有灰色躯干要保护。
//   ⚠️ 试过用「高容差多吃掉的面积比例」自动二选一，**不成立**：辉光怪掉 23~39%、
//      石头怪掉 27~30%，两者完全重叠。只能靠眼睛按真实显示尺寸判。
import { execFileSync } from 'node:child_process'

const [, , inPath, outPath, ...flags] = process.argv
const TOL = Number((flags.find((f) => f.startsWith('--tol=')) || '--tol=14').slice(6))
const DEBUG = flags.includes('--debug')

const wh = execFileSync('magick', ['identify', '-format', '%w %h', inPath]).toString().split(' ')
const W = +wh[0], H = +wh[1]
const raw = execFileSync('magick', [inPath, '-depth', '8', 'RGB:-'], { maxBuffer: 1 << 28 })

const idx = (x, y) => (y * W + x) * 3
const at = (x, y) => { const i = idx(x, y); return [raw[i], raw[i + 1], raw[i + 2]] }

/** 灰：三通道彼此接近 */
const CHROMA = Number((flags.find((f) => f.startsWith("--chroma=")) || "--chroma=10").slice(9))
const isGrey = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) <= CHROMA

// ── A. 从 1px 边界环统计出棋盘的两种灰 ─────────────────────────────
const hist = new Map()
const border = []
for (let x = 0; x < W; x++) { border.push([x, 0], [x, H - 1]) }
for (let y = 1; y < H - 1; y++) { border.push([0, y], [W - 1, y]) }
for (const [x, y] of border) {
  const p = at(x, y)
  if (!isGrey(p)) continue
  const v = Math.round((p[0] + p[1] + p[2]) / 3)
  if (v < 20 || v > 160) continue          // 棋盘的两种灰都在这个区间；纯黑描边/亮色主体排除
  hist.set(v, (hist.get(v) || 0) + 1)
}
// 取两个互相隔开 ≥ 8 的峰值（棋盘就是两种灰交替）
const peaks = [...hist.entries()].sort((a, b) => b[1] - a[1])
const greys = []
for (const [v] of peaks) {
  if (greys.every((g) => Math.abs(g - v) >= 8)) greys.push(v)
  if (greys.length === 2) break
}
if (greys.length === 0) { console.error(`${inPath}: 边界上找不到棋盘灰，跳过`); process.exit(2) }

// ── B. 候选像素：灰、且落在「两种棋盘灰之间的整条带」内 ──────────────
// ⚠️ 必须覆盖**整条带**而不是各自 ±TOL：太空那批两种灰是 41 与 88，跨度 47，
// 只取各自 ±14 会在 55~74 留一条死区——而那正是两格之间的抗锯齿过渡带，
// 于是泛洪的连通性被切断、整块棋盘留在图上。神庙那批间距只有 13，
// 各自 ±14 恰好连成一片，所以第一轮只有太空那批坏掉，掩盖了这个 bug。
const lo = Math.min(...greys) - TOL
const hi = Math.max(...greys) + TOL
const cand = new Uint8Array(W * H)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = at(x, y)
  if (!isGrey(p)) continue
  const v = (p[0] + p[1] + p[2]) / 3
  if (v >= lo && v <= hi) cand[y * W + x] = 1
}

// ── C. 连通分量：边界连通的删；被怪兽围住的「内部空洞」按棋盘特征判 ────
// 8 连通（棋盘同色格子只在对角相邻）。
const NEAR = 10
const comp = new Int32Array(W * H).fill(-1)
const bg = new Uint8Array(W * H)
let nComp = 0
for (let s = 0; s < W * H; s++) {
  if (!cand[s] || comp[s] >= 0) continue
  const id = nComp++
  const px = [s]
  comp[s] = id
  let touchesBorder = false, hasLo = false, hasHi = false, size = 0
  const stack = [s]
  while (stack.length) {
    const k = stack.pop(), x = k % W, y = (k - x) / W
    size++
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) touchesBorder = true
    const v = (raw[idx(x, y)] + raw[idx(x, y) + 1] + raw[idx(x, y) + 2]) / 3
    if (Math.abs(v - Math.min(...greys)) <= NEAR) hasLo = true
    if (Math.abs(v - Math.max(...greys)) <= NEAR) hasHi = true
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const nk = ny * W + nx
      if (cand[nk] && comp[nk] < 0) { comp[nk] = id; px.push(nk); stack.push(nk) }
    }
  }
  // 边界连通 = 外围背景，直接删。
  // 内部空洞（怪兽翅膀之间那种）碰不到边界，改按棋盘特征判：真棋盘必然**同时**
  // 含有两种灰；而怪兽身上一块平涂的灰只会命中其中一种，因此不会被误删。
  const isBg = touchesBorder || (hasLo && hasHi && size >= 40)
  if (isBg) for (const k of px) bg[k] = 1
}

// ── D. 软边：紧贴背景的那一圈做半透明，消掉锯齿与灰边 ────────────────
// 一个不透明像素若 8 邻域里有背景，就按「它离棋盘灰有多近」压 alpha。
const out = Buffer.alloc(W * H * 4)
let kept = 0
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const k = y * W + x, i = idx(x, y), o = k * 4
  out[o] = raw[i]; out[o + 1] = raw[i + 1]; out[o + 2] = raw[i + 2]
  if (bg[k]) { out[o + 3] = 0; continue }
  let a = 255
  let touchesBg = false
  for (let dy = -1; dy <= 1 && !touchesBg; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
    if (bg[ny * W + nx]) { touchesBg = true; break }
  }
  if (touchesBg && isGrey(at(x, y))) {
    const v = (raw[i] + raw[i + 1] + raw[i + 2]) / 3
    // d = 越出候选带多远。刚出带（d=0）全透明，出带 TOL 之后全不透明——
    // 这一段就是描边与棋盘之间那圈被混合过的像素，不压掉会留一道灰边。
    const d = (v < lo + TOL) ? lo - v : v - hi
    a = Math.max(0, Math.min(255, Math.round((d / TOL) * 255)))
  }
  out[o + 3] = a
  if (a > 0) kept++
}

// ── E. 可选羽化：大辉光的那几只，外缘 N px 线性淡出 ──────────────────
// 辉光外缘是「光」与深灰棋盘混出来的偏色像素，色相不够中性、进不了候选带，
// 于是在白底图鉴上留一圈暗环。只对辉光型（黑洞/彗星/陨石那类没有清晰剪影的）
// 开这个开关——对有清晰剪影的怪开会把轮廓啃软。
const FEATHER = Number((flags.find((f) => f.startsWith('--feather=')) || '--feather=0').slice(10))
if (FEATHER > 0) {
  const dist = new Int32Array(W * H).fill(-1)
  const q = []
  for (let k = 0; k < W * H; k++) if (bg[k]) { dist[k] = 0; q.push(k) }
  for (let qi = 0; qi < q.length; qi++) {
    const k = q[qi], x = k % W, y = (k - x) / W
    if (dist[k] >= FEATHER) continue
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const nk = ny * W + nx
      if (dist[nk] < 0) { dist[nk] = dist[k] + 1; q.push(nk) }
    }
  }
  for (let k = 0; k < W * H; k++) {
    if (dist[k] <= 0) continue
    const ramp = Math.min(255, Math.round((dist[k] / FEATHER) * 255))
    if (ramp < out[k * 4 + 3]) out[k * 4 + 3] = ramp
  }
}

execFileSync('magick', ['-size', `${W}x${H}`, '-depth', '8', 'RGBA:-', outPath], { input: out })
if (DEBUG) {
  const pct = ((kept / (W * H)) * 100).toFixed(1)
  console.log(`${inPath.split('/').pop().padEnd(24)} greys=[${greys}] 保留=${pct}%`)
}
