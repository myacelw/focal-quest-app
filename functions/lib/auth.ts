import type { Env } from './db'
import { randomHex, hashToken, timingSafeEqual } from './crypto'

export interface AuthedUser {
  id: string
  isAdmin: boolean
}

/** 签发会话 token：返回明文给客户端，库里只存哈希 */
export async function issueToken(env: Env, userId: string, nowMs = Date.now()): Promise<string> {
  const token = randomHex(32)
  await env.DB.prepare(
    `INSERT INTO tokens (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)`,
  ).bind(await hashToken(token), userId, nowMs, nowMs).run()
  return token
}

const TOKEN_TTL_MS = 365 * 86400_000 // 家庭设备，免频繁重登（spec §5.3）

/**
 * 校验 Authorization: Bearer <token>。有效则顺带刷新 last_seen_at
 * （兼作"打开过 app"的活跃口径，供管理后台用）。
 */
export async function requireUser(req: Request, env: Env, nowMs = Date.now()): Promise<AuthedUser | null> {
  const raw = req.headers.get('Authorization') ?? ''
  if (!raw.startsWith('Bearer ')) return null
  const token = raw.slice(7).trim()
  if (token.length !== 64) return null // randomHex(32) 恒为 64 字符

  const hash = await hashToken(token)
  const row = await env.DB.prepare(
    `SELECT t.token_hash, t.user_id, t.created_at, u.is_admin
       FROM tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ?`,
  ).bind(hash).first<{ token_hash: string; user_id: string; created_at: number; is_admin: number }>()
  if (!row) return null
  // 取回后再做一次常数时间比较：防御性，避免将来换成前缀查询时引入试探侧信道
  if (!timingSafeEqual(row.token_hash, hash)) return null
  if (nowMs - row.created_at > TOKEN_TTL_MS) return null

  await env.DB.prepare(`UPDATE tokens SET last_seen_at = ? WHERE token_hash = ?`).bind(nowMs, hash).run()
  return { id: row.user_id, isAdmin: row.is_admin === 1 }
}
