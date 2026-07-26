import type { Env } from '../../lib/db'
import { json, errorJson } from '../../lib/http'
import { requireUser } from '../../lib/auth'
import {
  ADMIN_DAYS, ADMIN_TZ_SQL, RECENT_DAYS, adminGate, dateList, shapeAdminStats, windowStartMs,
  type InviterRow, type RawAdminStats, type RecentUser,
} from '../../lib/admin-stats'

/** 最近注册与邀请排行各取前 N 条——自用后台，不做分页 */
const LIST_LIMIT = 20

/** batch() 的每个结果取第一行（单行聚合查询用）；空结果给 null，调用方各自兜默认值 */
function one<T>(r: D1Result<unknown>): T | null {
  return ((r.results as T[])[0] ?? null)
}
/** batch() 的每个结果取全部行 */
function many<T>(r: D1Result<unknown>): T[] {
  return (r.results as T[]) ?? []
}

/**
 * 管理后台统计（spec §8）。仅 is_admin=1 可访问。
 *
 * - 鉴权判定走 `adminGate` 纯函数（**401 vs 403 刻意分开**：401 = 没登录/token 失效，
 *   403 = 登录了但没权限；合成一个码，排障时分不清"该重新登录"还是"该去 D1 里设 is_admin"）。
 *   抽成纯函数的理由见 admin-stats.ts 里 adminGate 的注释——简言之 CI 不跑 test:api。
 * - 所有 SQL 都是只读、且只碰 kind / updated_at / user_id / email / last_seen_at / counters
 *   这些**列**。**不解析 records.payload**：那里面是孩子的训练内容，服务端自始至终不看。
 * - **分日与活跃口径用 `records.updated_at`（客户端写入时刻，即"练的时候"），不用 `received_at`。**
 *   updated_at 是一列（src/data/api.ts 的 enqueuePut 写的 Date.now()，clampUpdatedAt 已钳掉未来值），
 *   读列不违反"不解析 payload"。用 received_at 会有两个真实后果：①离线几天再联网，那几天的训练
 *   全部堆到补传当天，曲线与 DAU 整体失真；②push.ts 的 ON CONFLICT 里写着
 *   `received_at = excluded.received_at`，任何一次 LWW 覆盖都会把该行的 received_at 前移，
 *   于是**历史那根柱子会回溯变矮**、后台数字不可复现。received_at 只留给排障 SQL。
 *   代价：idx_records_kind(kind, received_at) 从此只吃到 kind 前缀（家庭量级无所谓）。
 * - 分日键按**东八区**（ADMIN_TZ_SQL），与纯函数侧的 ADMIN_TZ_OFFSET_MS 是同一个 8 小时。
 * - 8 条查询打成一次 `env.DB.batch()`：8 个往返变 1 个。**并非只为延迟**——D1 免费层是
 *   500 万行读/日，且这份配额与云同步共用；配额耗尽不是"后台看不了"而是"训练数据同步不上"。
 *   一次刷新的行读量 ≈ records 总行数（GROUP BY kind 全扫）+ 2 × session 分区行数。
 *   所以也**不做自动轮询**（见「明确不做」#5），并且 totals.records 由 kindRows 求和、
 *   不再单独 COUNT(*) FROM records。
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const now = Date.now()
  const user = await requireUser(request, env, now)
  const gate = adminGate(user)
  if (gate !== 'ok') return errorJson(gate, gate === 'unauthorized' ? 401 : 403)

  const d1 = windowStartMs(now, 1)
  const d7 = windowStartMs(now, 7)
  const d30 = windowStartMs(now, ADMIN_DAYS)
  const dRecent = windowStartMs(now, RECENT_DAYS)
  const sinceDate = dateList(now, ADMIN_DAYS)[0]

  const [totalsRes, kindRes, dailyRes, sessionRes, openRes, recentRes, inviterRes, counterRes] =
    await env.DB.batch([
      // tokens 用「近 30 天有活动」而不是 COUNT(*)：tokens 行从不删除（clearAccount 只清本地
      // syncMeta，functions/ 下没有任何 DELETE FROM tokens，365 天 TTL 也只在 requireUser 里判），
      // 累计数是"签发过多少令牌"、会一路涨（跑一轮 test-api.mjs 就造 4 个），当"设备数"看会误判。
      env.DB.prepare(
        `SELECT (SELECT COUNT(*) FROM users) AS users,
                (SELECT COUNT(*) FROM tokens WHERE last_seen_at >= ?1) AS tokens`,
      ).bind(d30),

      // 各 kind 的累计量 + 近 RECENT_DAYS 天新增（spec §8 要的"记录量与增速"）。
      // 30 天曲线只覆盖 session，其余 6 类靠这个 recent 才看得出在不在长。
      env.DB.prepare(
        `SELECT kind, COUNT(*) AS n,
                SUM(CASE WHEN updated_at >= ?1 THEN 1 ELSE 0 END) AS recent
           FROM records GROUP BY kind`,
      ).bind(dRecent),

      // 主口径：按**客户端**写入时刻分日（updated_at 是 UTC 毫秒，/1000 后交给 strftime，
      // 再用 ADMIN_TZ_SQL 挪到东八区日界）
      env.DB.prepare(
        `SELECT strftime('%Y-%m-%d', updated_at / 1000, 'unixepoch', ?2) AS date, COUNT(*) AS n
           FROM records
          WHERE kind = 'session' AND updated_at >= ?1
          GROUP BY date ORDER BY date`,
      ).bind(d30, ADMIN_TZ_SQL),

      // 日活/周活/月活主口径 = 窗口内有 session 记录的去重用户。
      // 三个窗口用条件聚合一次算完（外层 WHERE 已收窄到 30 天，所以 d30 直接 COUNT DISTINCT）。
      env.DB.prepare(
        `SELECT COUNT(DISTINCT CASE WHEN updated_at >= ?2 THEN user_id END) AS d1,
                COUNT(DISTINCT CASE WHEN updated_at >= ?3 THEN user_id END) AS d7,
                COUNT(DISTINCT user_id)                                     AS d30
           FROM records WHERE kind = 'session' AND updated_at >= ?1`,
      ).bind(d30, d1, d7),

      // 辅口径 = "打开过 app 的人"（requireUser 每次刷新 tokens.last_seen_at）
      env.DB.prepare(
        `SELECT COUNT(DISTINCT CASE WHEN last_seen_at >= ?2 THEN user_id END) AS d1,
                COUNT(DISTINCT CASE WHEN last_seen_at >= ?3 THEN user_id END) AS d7,
                COUNT(DISTINCT user_id)                                      AS d30
           FROM tokens WHERE last_seen_at >= ?1`,
      ).bind(d30, d1, d7),

      // 邀请人 email 靠自连接拿；LEFT JOIN 是必须的——站长的 invited_by 是 NULL
      env.DB.prepare(
        `SELECT u.email AS email, u.created_at AS createdAt, u.is_admin AS isAdmin,
                p.email AS inviterEmail
           FROM users u LEFT JOIN users p ON p.id = u.invited_by
          ORDER BY u.created_at DESC LIMIT ?1`,
      ).bind(LIST_LIMIT),

      // 邀请排行：只列真的邀请过人的账号，故用 INNER JOIN。
      // 同邀请数时按邀请人注册时间倒序（"最近谁在拉人"），不按字母序——字母序会让
      // 本地 D1 里累积的历史测试账号把新账号挤出 LIMIT 20（u.id 已在 GROUP BY 里，
      // SQLite 允许 ORDER BY 里带同组的裸列）。
      env.DB.prepare(
        `SELECT u.email AS email, u.invite_quota AS quota, COUNT(c.id) AS invited
           FROM users u JOIN users c ON c.invited_by = u.id
          GROUP BY u.id, u.email, u.invite_quota
          ORDER BY invited DESC, u.created_at DESC LIMIT ?1`,
      ).bind(LIST_LIMIT),

      // NOT LIKE 'rl.%' 把限速桶挡在 SQL 层（isAbuseMetric 的形状白名单是第二道）
      env.DB.prepare(
        `SELECT metric, SUM(value) AS value FROM counters
          WHERE date >= ?1 AND metric NOT LIKE 'rl.%'
          GROUP BY metric`,
      ).bind(sinceDate),
    ])

  const totals = one<{ users: number; tokens: number }>(totalsRes)
  const sessionUsers = one<{ d1: number; d7: number; d30: number }>(sessionRes)
  const openUsers = one<{ d1: number; d7: number; d30: number }>(openRes)

  const raw: RawAdminStats = {
    userCount: totals?.users ?? 0,
    activeTokenCount: totals?.tokens ?? 0,
    kindRows: many<{ kind: string; n: number; recent: number }>(kindRes)
      .map((r) => ({ kind: r.kind, count: r.n, recent: r.recent ?? 0 })),
    dailyRows: many<{ date: string; n: number }>(dailyRes)
      .map((r) => ({ date: r.date, count: r.n })),
    sessionUsers: { d1: sessionUsers?.d1 ?? 0, d7: sessionUsers?.d7 ?? 0, d30: sessionUsers?.d30 ?? 0 },
    openUsers: { d1: openUsers?.d1 ?? 0, d7: openUsers?.d7 ?? 0, d30: openUsers?.d30 ?? 0 },
    recentUsers: many<{ email: string; createdAt: number; isAdmin: number; inviterEmail: string | null }>(recentRes)
      .map((r): RecentUser => ({
        email: r.email,
        createdAt: r.createdAt,
        invitedByEmail: r.inviterEmail,
        isAdmin: r.isAdmin === 1,
      })),
    inviters: many<{ email: string; quota: number; invited: number }>(inviterRes)
      .map((r): InviterRow => ({ email: r.email, invited: r.invited, quota: r.quota })),
    counterRows: many<{ metric: string; value: number }>(counterRes),
  }

  return json(shapeAdminStats(raw, now))
}
