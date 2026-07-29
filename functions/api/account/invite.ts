import type { Env } from '../../lib/db'
import { bumpCounter, hitRateLimit, readRateLimit } from '../../lib/db'
import { json, errorJson } from '../../lib/http'
import { requireUser, adminGate } from '../../lib/auth'
import { genInviteCode } from '../../lib/invite'
import { DAY_MS, overLimit } from '../../lib/ratelimit'

/**
 * 换码日限。无限换码等于无限名额，而这个端点的唯一凭证是一个 **365 天不过期**的 token
 * （见 lib/auth.ts 的 TOKEN_TTL_MS）。按用户计而不是按 IP：换码是账号级操作，
 * 一家人共用出口 IP 时不该互相挤额度。
 */
const ROTATE_PER_DAY_MAX = 5

/** 新码撞 invite_code 的 UNIQUE 约束时的重试次数 */
const ROTATE_TRIES = 3

interface InviteState {
  inviteCode: string
  used: number
  quota: number
  isAdmin: boolean
}

/**
 * 读当前邀请码状态。
 *
 * ⚠️ `used` 的口径必须与 functions/api/auth/register.ts 的配额判据**逐字一致**：
 * 一处显示"还剩 1 个"、另一处判满，是最难排查的一类不一致——家长看着还有名额，
 * 亲友那边却一直报"名额用完了"，两边都没有错误日志。
 */
async function readState(env: Env, userId: string, isAdmin: boolean): Promise<InviteState | null> {
  const row = await env.DB.prepare(
    `SELECT u.invite_code AS code, u.invite_quota AS quota,
            (SELECT COUNT(*) FROM users c
              WHERE c.invited_by = u.id AND c.created_at >= u.invite_reset_at) AS used
       FROM users u WHERE u.id = ?`,
  ).bind(userId).first<{ code: string; quota: number; used: number }>()
  if (!row) return null
  return { inviteCode: row.code, used: row.used, quota: row.quota, isAdmin }
}

/**
 * GET /api/account/invite —— 读自己的邀请码、已用数与额度。
 *
 * 任何已登录用户可调（家长得看得见"已邀 2/5"才知道还能给谁）。
 * 顺带回 isAdmin：客户端那份是登录响应的快照，改完 D1 里的 is_admin 本来要重新登录
 * 才生效，有了这个字段打开设置页就生效。
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env)
  if (user === null) return errorJson('unauthorized', 401)
  const state = await readState(env, user.id, user.isAdmin)
  // requireUser 已 JOIN users，理论上取不到行只可能是并发删号；按未授权处理
  if (state === null) return errorJson('unauthorized', 401)
  return json(state)
}

/**
 * POST /api/account/invite —— 换一个新邀请码（**仅管理员**）。
 *
 * 同一条 UPDATE 里写 invite_code 与 invite_reset_at：旧码立刻失效，名额从这一刻重新算起
 * （spec §2.1）。**不做宽限期**——立即失效正是"作废泄露的码"的全部意义。
 *
 * 与 GET 同路径、用方法区分，是为了让两者共用 readState()：响应形状必须一致，
 * 分成两个文件就会有两份 used 口径。
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const now = Date.now()
  const user = await requireUser(request, env, now)
  const gate = adminGate(user)
  if (gate !== 'ok') return errorJson(gate, gate === 'unauthorized' ? 401 : 403)
  // gate === 'ok' 蕴含 user !== null，但 TS 收窄不到这一步，显式再判一次
  if (user === null) return errorJson('unauthorized', 401)

  const scope = `invite.rotate.${user.id}`
  // 先读后判、不自增：成功换码才吃额度（与 register 的成功额度同一套做法）
  if (overLimit(await readRateLimit(env, scope, DAY_MS, now), ROTATE_PER_DAY_MAX)) {
    await bumpCounter(env, 'invite.rotate.ratelimit', now)
    return errorJson('too_many_requests', 429)
  }

  for (let i = 0; i < ROTATE_TRIES; i++) {
    try {
      await env.DB.prepare(
        `UPDATE users SET invite_code = ?, invite_reset_at = ? WHERE id = ?`,
      ).bind(genInviteCode(), now, user.id).run()
    } catch (e) {
      // 撞上别人已有的码就重摇一个再试；其余错误照常抛
      if (String(e).includes('UNIQUE')) continue
      throw e
    }
    const state = await readState(env, user.id, user.isAdmin)
    if (state === null) return errorJson('unauthorized', 401)
    await hitRateLimit(env, scope, DAY_MS, now)
    await bumpCounter(env, 'invite.rotate.ok', now)
    return json(state)
  }
  // 连撞 ROTATE_TRIES 次：客户端重试即可（沿用 register 里同名的 retry 码）
  return errorJson('retry', 503)
}
