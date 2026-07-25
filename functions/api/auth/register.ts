import type { Env } from '../../lib/db'
import { bumpCounter, hitRateLimit } from '../../lib/db'
import { json, errorJson, readJson, clientIp } from '../../lib/http'
import { normalizeEmail, isValidEmail, randomHex, hashAuthKey } from '../../lib/crypto'
import { genInviteCode, isValidInviteCodeShape, normalizeInviteCode } from '../../lib/invite'
import { issueToken } from '../../lib/auth'
import { DAY_MS, REGISTER_PER_IP_MAX, overLimit } from '../../lib/ratelimit'

interface Body {
  email?: string
  authKey?: string
  inviteCode?: string
}

/**
 * 注册（一期需邀请码，spec §9.2）。邀请码有两种来源：
 *  - 归属码：某账号的 users.invite_code，注册后 invited_by 记为该账号（注册来源可追溯）
 *  - 引导码：BOOTSTRAP_INVITE_CODE 环境变量，仅供站长开局，用完应删除该 secret
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const now = Date.now()
  const body = await readJson<Body>(request)
  if (!body) return errorJson('bad_request', 400)

  const email = normalizeEmail(body.email ?? '')
  const authKey = body.authKey ?? ''
  const codeRaw = body.inviteCode ?? ''

  if (!isValidEmail(email)) return errorJson('bad_email', 400)
  // authKey 是客户端 PBKDF2 输出的 hex，长度固定；此处只做形状校验
  if (!/^[0-9a-f]{64}$/.test(authKey)) return errorJson('bad_auth_key', 400)
  if (!isValidInviteCodeShape(codeRaw)) {
    await bumpCounter(env, 'register.badcode', now)
    return errorJson('bad_invite_code', 400)
  }
  const code = normalizeInviteCode(codeRaw)

  // 每 IP 每日注册上限。这里先自增再判：注册尝试无论成败都该消耗额度（防批量注册），
  // 所以 hitRateLimit 已含本次，减 1 才是"本次之前的次数"。
  const ipHits = await hitRateLimit(env, `reg.${clientIp(request)}`, DAY_MS, now)
  if (overLimit(ipHits - 1, REGISTER_PER_IP_MAX)) {
    await bumpCounter(env, 'register.ratelimit', now)
    return errorJson('too_many_requests', 429)
  }

  // 解析邀请码：先查归属码，再看引导码
  let invitedBy: string | null = null
  const inviter = await env.DB.prepare(
    `SELECT id, invite_quota,
            (SELECT COUNT(*) FROM users c WHERE c.invited_by = u.id) AS used
       FROM users u WHERE invite_code = ?`,
  ).bind(code).first<{ id: string; invite_quota: number; used: number }>()

  if (inviter) {
    if (inviter.used >= inviter.invite_quota) {
      await bumpCounter(env, 'register.quotaexhausted', now)
      return errorJson('invite_quota_exhausted', 403)
    }
    invitedBy = inviter.id
  } else if (env.BOOTSTRAP_INVITE_CODE && code === normalizeInviteCode(env.BOOTSTRAP_INVITE_CODE)) {
    invitedBy = null // 站长
  } else {
    await bumpCounter(env, 'register.badcode', now)
    return errorJson('bad_invite_code', 400)
  }

  // 建号。email 唯一约束由 D1 保证，冲突即已注册。
  const userId = crypto.randomUUID()
  const serverSalt = randomHex(16)
  const authHash = await hashAuthKey(authKey, serverSalt)
  const myCode = genInviteCode()

  try {
    await env.DB.prepare(
      `INSERT INTO users (id, email, auth_hash, server_salt, is_admin, invite_code, invited_by, invite_quota, sync_seq, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, 5, 0, ?)`,
    ).bind(userId, email, authHash, serverSalt, myCode, invitedBy, now).run()
  } catch (e) {
    const msg = String(e)
    if (msg.includes('UNIQUE') && msg.includes('email')) return errorJson('email_taken', 409)
    if (msg.includes('UNIQUE') && msg.includes('invite_code')) return errorJson('retry', 503) // 邀请码撞车，客户端重试即可
    throw e
  }

  const token = await issueToken(env, userId, now)
  await bumpCounter(env, 'register.ok', now)
  return json({ token, userId, inviteCode: myCode, isAdmin: false }, 201)
}
