/**
 * 服务端加密小工具。全部基于 WebCrypto（Workers 与 Node 都内置），不引第三方库。
 *
 * 密码方案（见 spec §5.2）：客户端做 PBKDF2 310k 次拉伸得到 authKey，服务端只做
 * 一次加盐 SHA-256。这样 Workers 免费层 ~10ms 的 CPU 预算够用，而数据库泄露时
 * 攻击者仍需面对客户端那层拉伸。
 */

const enc = new TextEncoder()

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(input)))
}

export function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 用 ':' 分隔盐与 key，避免 ("ab","c") 与 ("a","bc") 拼接碰撞 */
export async function hashAuthKey(authKey: string, serverSalt: string): Promise<string> {
  return sha256Hex(`${serverSalt}:${authKey}`)
}

export async function hashToken(token: string): Promise<string> {
  return sha256Hex(token)
}

/** 常数时间比较：逐字符异或累加，不提前 return，避免按前缀试探 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isValidEmail(raw: string): boolean {
  const s = raw.trim()
  if (s.length === 0 || s.length > 254) return false
  // 刻意保守：一个 @、两侧非空、无空白、域名含点
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s)
}
