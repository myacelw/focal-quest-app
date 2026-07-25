import type { Env } from '../../lib/db'
import { bumpCounter, hitRateLimit, readRateLimit } from '../../lib/db'
import { json, errorJson, readJson, clientIp } from '../../lib/http'
import { normalizeEmail, isValidEmail, hashAuthKey, timingSafeEqual } from '../../lib/crypto'
import { issueToken } from '../../lib/auth'
import { HOUR_MS, LOGIN_FAIL_MAX, overLimit } from '../../lib/ratelimit'

interface Body {
  email?: string
  authKey?: string
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const now = Date.now()
  const body = await readJson<Body>(request)
  if (!body) return errorJson('bad_request', 400)

  const email = normalizeEmail(body.email ?? '')
  const authKey = body.authKey ?? ''
  if (!isValidEmail(email) || !/^[0-9a-f]{64}$/.test(authKey)) return errorJson('bad_credentials', 401)

  // 失败限速按 email+IP 计（spec §5.2）：先读计数判超限，只有失败才自增
  // ——成功登录不该消耗额度。读写共用 rateLimitMetric()，避免两处拼 key 失配。
  const scope = `login.${email}.${clientIp(request)}`
  const fails = await readRateLimit(env, scope, HOUR_MS, now)
  if (overLimit(fails, LOGIN_FAIL_MAX)) {
    await bumpCounter(env, 'login.ratelimit', now)
    return errorJson('too_many_requests', 429)
  }

  const user = await env.DB.prepare(
    `SELECT id, auth_hash, server_salt, is_admin, invite_code FROM users WHERE email = ?`,
  ).bind(email).first<{ id: string; auth_hash: string; server_salt: string; is_admin: number; invite_code: string }>()

  // 邮箱不存在也走一次哈希再拒，避免用响应时间探测邮箱是否注册
  const expect = await hashAuthKey(authKey, user?.server_salt ?? 'dummy-salt')
  if (!user || !timingSafeEqual(user.auth_hash, expect)) {
    await hitRateLimit(env, scope, HOUR_MS, now)
    await bumpCounter(env, 'login.fail', now)
    return errorJson('bad_credentials', 401)
  }

  const token = await issueToken(env, user.id, now)
  await bumpCounter(env, 'login.ok', now)
  return json({ token, userId: user.id, inviteCode: user.invite_code, isAdmin: user.is_admin === 1 })
}
