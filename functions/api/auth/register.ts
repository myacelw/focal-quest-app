import type { Env } from '../../lib/db'
import { bumpCounter, hitRateLimit, readRateLimit } from '../../lib/db'
import { json, errorJson, readJson, clientIp } from '../../lib/http'
import { normalizeEmail, isValidEmail, randomHex, hashAuthKey } from '../../lib/crypto'
import { genInviteCode, isValidInviteCodeShape, normalizeInviteCode } from '../../lib/invite'
import { issueToken } from '../../lib/auth'
import { DAY_MS, HOUR_MS, REGISTER_OK_PER_IP_MAX, REGISTER_FAIL_PER_IP_MAX, overLimit } from '../../lib/ratelimit'

interface Body {
  email?: string
  authKey?: string
  inviteCode?: string
}

/**
 * 注册（一期需邀请码，spec §9.2）。邀请码有两种来源：
 *  - 归属码：某账号的 users.invite_code，注册后 invited_by 记为该账号（注册来源可追溯）
 *  - 引导码：BOOTSTRAP_INVITE_CODE 环境变量，仅供站长开局，用完应删除该 secret
 *
 * 限速分两道（见 lib/ratelimit.ts 的说明）：成功建号按日限，失败尝试按小时限。
 * 不合并成一个日额度——否则家长手抄错邀请码几次就被锁一整天。
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const now = Date.now()
  const ip = clientIp(request)
  const okScope = `reg.ok.${ip}`
  const failScope = `reg.fail.${ip}`

  /** 记一次失败尝试（吃小时窗口额度）并生成响应 */
  const fail = async (metric: string, code: string, status: number): Promise<Response> => {
    await hitRateLimit(env, failScope, HOUR_MS, now)
    await bumpCounter(env, metric, now)
    return errorJson(code, status)
  }

  const body = await readJson<Body>(request)
  if (!body) return errorJson('bad_request', 400)

  const email = normalizeEmail(body.email ?? '')
  const authKey = body.authKey ?? ''
  const codeRaw = body.inviteCode ?? ''

  // 邮箱/authKey 的形状错误不计入失败限速：那是客户端 bug 或纯笔误，
  // 与"猜邀请码"性质不同（客户端本就该先做本地校验）。
  if (!isValidEmail(email)) return errorJson('bad_email', 400)
  // authKey 是客户端 PBKDF2 输出的 hex，长度固定；此处只做形状校验
  if (!/^[0-9a-f]{64}$/.test(authKey)) return errorJson('bad_auth_key', 400)

  // 两道限速都先读后判（不自增），互不消耗对方额度
  if (overLimit(await readRateLimit(env, failScope, HOUR_MS, now), REGISTER_FAIL_PER_IP_MAX)) {
    await bumpCounter(env, 'register.ratelimit', now)
    return errorJson('too_many_requests', 429)
  }
  if (overLimit(await readRateLimit(env, okScope, DAY_MS, now), REGISTER_OK_PER_IP_MAX)) {
    await bumpCounter(env, 'register.ratelimit', now)
    return errorJson('too_many_requests', 429)
  }

  if (!isValidInviteCodeShape(codeRaw)) return await fail('register.badcode', 'bad_invite_code', 400)
  const code = normalizeInviteCode(codeRaw)

  // 解析邀请码：先查归属码，再看引导码
  let invitedBy: string | null = null
  const inviter = await env.DB.prepare(
    `SELECT id, invite_quota,
            (SELECT COUNT(*) FROM users c WHERE c.invited_by = u.id) AS used
       FROM users u WHERE invite_code = ?`,
  ).bind(code).first<{ id: string; invite_quota: number; used: number }>()

  if (inviter) {
    if (inviter.used >= inviter.invite_quota) {
      return await fail('register.quotaexhausted', 'invite_quota_exhausted', 403)
    }
    invitedBy = inviter.id
  } else if (env.BOOTSTRAP_INVITE_CODE && code === normalizeInviteCode(env.BOOTSTRAP_INVITE_CODE)) {
    invitedBy = null // 站长
  } else {
    return await fail('register.badcode', 'bad_invite_code', 400)
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
    // 重复邮箱是"已注册"，属用户侧信息，不吃失败额度（否则一家人试同一邮箱几次就被锁）
    if (msg.includes('UNIQUE') && msg.includes('email')) return errorJson('email_taken', 409)
    if (msg.includes('UNIQUE') && msg.includes('invite_code')) return errorJson('retry', 503) // 邀请码撞车，客户端重试即可
    throw e
  }

  const token = await issueToken(env, userId, now)
  await hitRateLimit(env, okScope, DAY_MS, now) // 成功建号才吃日额度
  await bumpCounter(env, 'register.ok', now)
  return json({ token, userId, inviteCode: myCode, isAdmin: false }, 201)
}
