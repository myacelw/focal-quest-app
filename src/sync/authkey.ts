/**
 * 客户端密码拉伸（spec §5.2）。
 *
 * 分工：客户端 PBKDF2-SHA256 拉伸 310000 次得到 authKey，服务端只对它做一次加盐 SHA-256。
 * 这样 Workers 免费层 ~10ms 的 CPU 预算够用，而数据库泄露时攻击者仍要面对客户端这层拉伸。
 * 盐用 normalize 后的邮箱：无需服务端先下发盐即可登录（少一次往返），
 * 且同一个密码在不同账号下派生出不同的 authKey。
 */
export const PBKDF2_ITERATIONS = 310_000

/** 必须与服务端 functions/lib/crypto.ts 的 normalizeEmail 逐字一致，否则盐不同、登录必失败 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** PBKDF2-SHA256 → 32 字节 → 64 位小写 hex（服务端只认这个形状） */
export async function deriveAuthKey(
  email: string,
  password: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(normalizeEmail(email)), iterations },
    key,
    256,
  )
  return toHex(bits)
}
