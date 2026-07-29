/**
 * 管理后台统计的"SQL 结果 → 响应结构"整形层（spec §8），外加鉴权判定。
 *
 * 这里只有纯函数：D1 查询本身由 scripts/test-api.mjs 的集成断言覆盖，
 * 鉴权分支/补零/排序/时区日界这些真正容易写错的地方留在单测里
 * （集成断言不进 CI 质量门，单测进——见 Global Constraints）。
 *
 * 铁律：**不解析 records.payload**。所有指标都由 kind / updated_at / user_id
 * 这几**列**派生，孩子的训练内容不进任何 admin 响应。
 */
import { KINDS } from './sync-validate'

const DAY_MS = 86_400_000

/** 曲线与滥用计数的窗口长度（天）。含今天，所以起点是今天减 29 天。 */
export const ADMIN_DAYS = 30

/** 各 kind「增速」的窗口长度（天）：近 7 天新增多少条 */
export const RECENT_DAYS = 7

/**
 * 分日口径的时区偏移：**东八区**（站长在这儿）。
 *
 * 为什么不用 UTC：UTC 日界 = 北京时间 08:00，用 UTC 分日会把**清晨 8 点前的训练算到前一天**、
 * 也不算进当天 DAU；而同一屏的"数据截至"用 toLocaleString() 显示的是本地时间，两套时区并置，
 * 站长很容易把"今天没柱子"误判成"今天没练"。
 *
 * 与 SQL 侧的 ADMIN_TZ_SQL 是同一个 8 小时，改一处必须改另一处（单测锚定了日界）。
 * 已知取舍：滥用计数那个 30 天窗口的边界与 counters.date（utcDate()，UTC）错开最多一天——
 * 30 天窗口最远端差一天，无信息损失。
 */
export const ADMIN_TZ_OFFSET_MS = 8 * 3_600_000

/** SQLite strftime 的第三个修饰符，与 ADMIN_TZ_OFFSET_MS 必须同步 */
export const ADMIN_TZ_SQL = '+8 hours'

export interface DailyCount { date: string; count: number }
export interface KindCount {
  kind: string
  count: number
  /** 近 RECENT_DAYS 天新增条数（spec §8 要的"增速"） */
  recent: number
}
export interface RecentUser {
  email: string
  createdAt: number
  /** 邀请人邮箱；null = 用引导码注册的站长，或邀请人已不存在 */
  invitedByEmail: string | null
  isAdmin: boolean
}
export interface InviterRow {
  email: string
  /** 历史累计邀请人数（跨所有世代的码） */
  invited: number
  quota: number
  /** **当前这个码**已用掉的名额（invite_reset_at 之后注册的人）——与注册端的配额判据同口径 */
  currentUsed: number
}
export interface AbuseRow { metric: string; total: number }

/** SQL 原样结果的集合，端点填好后交给 shapeAdminStats */
export interface RawAdminStats {
  userCount: number
  /** 近 30 天有活动的 token 数（不是累计签发数——tokens 行从不删除，累计数会一直涨） */
  activeTokenCount: number
  kindRows: { kind: string; count: number; recent: number }[]
  dailyRows: { date: string; count: number }[]
  /** 有 kind='session' 记录的去重用户数：近 1 / 7 / 30 个东八区日，按 updated_at */
  sessionUsers: { d1: number; d7: number; d30: number }
  /** tokens.last_seen_at 口径的去重用户数（"打开过 app 的人"） */
  openUsers: { d1: number; d7: number; d30: number }
  recentUsers: RecentUser[]
  inviters: InviterRow[]
  counterRows: { metric: string; value: number }[]
}

export interface AdminStats {
  generatedAt: number
  totals: { users: number; records: number; tokens: number }
  kinds: KindCount[]
  active: { dau: number; wau: number; mau: number; openDau: number; openWau: number; openMau: number }
  daily: DailyCount[]
  recentUsers: RecentUser[]
  inviters: InviterRow[]
  abuse: AbuseRow[]
}

/** 毫秒 → 东八区的 'YYYY-MM-DD' */
export function tzDate(ms: number): string {
  return new Date(ms + ADMIN_TZ_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * 含今天的近 days 个**东八区**日的起点（UTC 毫秒）。
 * 与 SQL 侧 `strftime('%Y-%m-%d', updated_at/1000, 'unixepoch', ADMIN_TZ_SQL)` 是同一个日界，
 * 两处口径必须一致，否则活跃数与曲线会在日界那几小时里互相矛盾。
 */
export function windowStartMs(nowMs: number, days: number): number {
  const todayStart = Math.floor((nowMs + ADMIN_TZ_OFFSET_MS) / DAY_MS) * DAY_MS - ADMIN_TZ_OFFSET_MS
  return todayStart - (days - 1) * DAY_MS
}

/** 升序的 YYYY-MM-DD 列表，末位是今天（东八区） */
export function dateList(nowMs: number, days: number): string[] {
  const start = windowStartMs(nowMs, days)
  return Array.from({ length: days }, (_, i) => tzDate(start + i * DAY_MS))
}

/**
 * counters 里哪些 metric 可以展示。
 *
 * **形状白名单，不是黑名单**：界面对未知 metric 的默认行为是"原样上屏"（刻意如此，
 * 新指标不该被静默吞掉），所以这里的默认行为必须是"挡住"。
 * `rl.` 前缀是固定窗口限速的内部计数桶，key 里编着 **IP 与邮箱**（`rl.login.<email>.<ip>.<窗口号>`）；
 * 而只排 `rl.` 前缀挡不住将来谁新加一个 `login.byip.<ip>` 之类的计数——那 IP 会直接打到界面上。
 * 白名单只放行 `小写点分段`（现有 register.ok / push.reject.bad_kind / active.user 全过），
 * 含 `@` 或含纯数字段的一律挡。要看被挡的只能在 D1 Console 里手动查。
 */
export function isAbuseMetric(metric: string): boolean {
  return !metric.startsWith('rl.') && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(metric)
}

/** 把稀疏的分日计数补成连续 days 天（缺的补 0），升序 */
export function fillDailyCounts(
  rows: { date: string; count: number }[], nowMs: number, days: number,
): DailyCount[] {
  const byDate = new Map(rows.map((r) => [r.date, r.count]))
  return dateList(nowMs, days).map((date) => ({ date, count: byDate.get(date) ?? 0 }))
}

/** 7 类记录一律出现（count 与 recent 都缺则补 0）且顺序固定；未知 kind 追加在末尾 */
export function fillKindCounts(rows: { kind: string; count: number; recent: number }[]): KindCount[] {
  const byKind = new Map(rows.map((r) => [r.kind, r]))
  const known: KindCount[] = KINDS.map((kind) => ({
    kind,
    count: byKind.get(kind)?.count ?? 0,
    recent: byKind.get(kind)?.recent ?? 0,
  }))
  const extra: KindCount[] = rows
    .filter((r) => !(KINDS as readonly string[]).includes(r.kind))
    .map((r) => ({ kind: r.kind, count: r.count, recent: r.recent }))
  return [...known, ...extra]
}

/** 跨日累加同名 metric，排掉 rl.*，按次数降序（同次数按名字升序，顺序稳定） */
export function sumAbuse(rows: { metric: string; value: number }[]): AbuseRow[] {
  const total = new Map<string, number>()
  for (const r of rows) {
    if (!isAbuseMetric(r.metric)) continue
    total.set(r.metric, (total.get(r.metric) ?? 0) + r.value)
  }
  return [...total.entries()]
    .map(([metric, value]) => ({ metric, total: value }))
    .sort((a, b) => (b.total - a.total) || a.metric.localeCompare(b.metric))
}

export function shapeAdminStats(raw: RawAdminStats, nowMs: number, days = ADMIN_DAYS): AdminStats {
  // totals.records 由 kindRows 求和，**不**单独 COUNT(*) FROM records：
  // records 表本就要为 GROUP BY kind 全扫一遍，再扫一遍纯属浪费 D1 行读配额，
  // 而那份配额是和云同步共用的（见 Architecture 判断 3）。
  const recordCount = raw.kindRows.reduce((n, r) => n + r.count, 0)
  return {
    generatedAt: nowMs,
    totals: { users: raw.userCount, records: recordCount, tokens: raw.activeTokenCount },
    kinds: fillKindCounts(raw.kindRows),
    active: {
      dau: raw.sessionUsers.d1,
      wau: raw.sessionUsers.d7,
      mau: raw.sessionUsers.d30,
      openDau: raw.openUsers.d1,
      openWau: raw.openUsers.d7,
      openMau: raw.openUsers.d30,
    },
    daily: fillDailyCounts(raw.dailyRows, nowMs, days),
    recentUsers: raw.recentUsers,
    inviters: raw.inviters,
    abuse: sumAbuse(raw.counterRows),
  }
}
