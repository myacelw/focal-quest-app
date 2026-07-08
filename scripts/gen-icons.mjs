// 生成 PWA 图标（纯 Node，零依赖）：糖果紫渐变底 + 白色“对焦环”标记，呼应变焦/视力训练。
// 输出 public/icon-192.png 和 public/icon-512.png。想换更好看的图，直接替换这两个 PNG 即可。
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// CRC32（PNG 每个 chunk 需要）
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function lerp(a, b, t) { return Math.round(a + (b - a) * t) }

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4)
  const cx = size / 2, cy = size / 2
  // 糖果紫渐变（左上 violet → 右下 violet-2）
  const c1 = [0x6c, 0x4b, 0xf0]
  const c2 = [0x8b, 0x6c, 0xff]
  const rOuter = size * 0.34    // 对焦环外半径
  const ring = size * 0.065     // 环厚
  const rDot = size * 0.095     // 中心圆点半径
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size)
      let r = lerp(c1[0], c2[0], t)
      let g = lerp(c1[1], c2[1], t)
      let b = lerp(c1[2], c2[2], t)
      const d = Math.hypot(x - cx, y - cy)
      // 白色对焦环 + 中心点
      const onRing = d >= rOuter - ring && d <= rOuter
      const onDot = d <= rDot
      if (onRing || onDot) { r = 255; g = 255; b = 255 }
      const i = (y * size + x) * 4
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255
    }
  }
  // 加 PNG 每行的 filter 前导字节（0 = None）
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512]) {
  const file = join(outDir, `icon-${size}.png`)
  writeFileSync(file, drawIcon(size))
  console.log(`生成 ${file}`)
}
// iOS 主屏图标（apple-touch-icon 用 180×180 最佳，这里复用 192 也可；单独出一张更稳）
writeFileSync(join(outDir, 'apple-touch-icon.png'), drawIcon(180))
console.log('生成 apple-touch-icon.png (180×180)')
