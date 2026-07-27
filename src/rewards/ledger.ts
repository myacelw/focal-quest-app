import type { RedemptionRow, CheckinRow } from '../data/db'
import { daysBetween, monthOf, addDays } from '../data/date-utils'

/**
 * 补签价（≈ 孩子练一天所得，真有痛感但救得起；改这一处即可调价）。
 *
 * 为什么从 50 涨到 500：一天进账 = (答对数×5 + 30) × 连续系数，按门槛每分钟 5 个、
 * 6 分钟算，一天保底 180 分、稳定期约 360 分。50 分不到一天的三分之一，
 * 等于白送——真正拦住补签的只有次数上限，积分那道形同虚设。
 */
export const REPAIR_COST = 500

/**
 * 每月补签上限。3 次 = 一个月最多漏 3 天 ≈ 90% 依从率。
 *
 * 价格才是主闸门，这条只是兜底：防止"攒够分就无限买连续"。另有一层天然保险——
 * `findRepairTarget` 只认"恰好漏 1 天"的孤立缺口，连漏 2 天根本补不了。
 */
export const REPAIR_MONTHLY_MAX = 3

/** 可用积分 = 累计赚取 − Σ(未取消消耗)，不为负 */
export function availablePoints(totalEarned: number, redemptions: RedemptionRow[]): number {
  const spent = redemptions
    .filter((r) => r.status !== 'cancelled')
    .reduce((sum, r) => sum + r.cost, 0)
  return Math.max(0, totalEarned - spent)
}

/**
 * 超支分数（未超支为 0）。`availablePoints` 用 `Math.max(0, …)` 把超支夹到 0，
 * 于是家长在 UI 上完全看不出账本已经对不上。
 *
 * 为什么会超支：3b-2 起账本是**多设备**的。两台设备离线时各自看到同样的余额、
 * 各建一条 redemption（不同 uuid、都合法），合并后两条都存活、消耗翻倍。
 * 余额校验纯在本地做，服务端不解析 payload、不校验余额（MVP 明示接受，见计划的已知限制）。
 * 补救方式是让家长看见并人工取消一条——本函数就是那个提示的判据。
 */
export function overspend(totalEarned: number, redemptions: RedemptionRow[]): number {
  const spent = redemptions
    .filter((r) => r.status !== 'cancelled')
    .reduce((sum, r) => sum + r.cost, 0)
  return Math.max(0, spent - totalEarned)
}

/** 当月（本地 YYYY-MM）已用补签次数 */
export function monthRepairCount(redemptions: RedemptionRow[], monthStr: string): number {
  return redemptions.filter(
    (r) => r.kind === 'repair' && r.status !== 'cancelled' && monthOf(r.createdDate) === monthStr,
  ).length
}

export type RepairReason = 'not-broken' | 'attempted' | 'no-points' | 'month-limit'
export interface RepairEligibility { ok: boolean; reason?: RepairReason }

/** 可补的缺口目标：补插哪天、补插行 streak/total、以及（若今天已打卡被重置）今天行要修正成的 streak */
export interface RepairTarget {
  missedDate: string        // 要补插的那天（= 缺口日）
  phantomStreak: number     // 补插行 streak = 缺口前一天 streak + 1
  phantomTotal: number      // 补插行 totalPoints（沿用缺口前一天，累计链不虚涨）
  fixTodayStreak?: number   // 今天已打卡且被重置时，今天行应改成的 streak（= phantomStreak + 1）
}

/**
 * 从 checkins 链找出"恰好漏 1 天"的可补缺口，无则 null。覆盖两种路径：
 *  A) 今天还没打卡：上次打卡在今天前 2 天 → 补插昨天。
 *  B) 今天已打卡但 streak 被重置：上一条打卡在今天前 2 天 → 补插昨天，并把今天行接续。
 * 这样即使孩子"先打卡后补签"，可补窗口也不会因打卡重置而消失。
 */
export function findRepairTarget(checkins: CheckinRow[], today: string): RepairTarget | null {
  if (checkins.length === 0) return null
  const sorted = [...checkins].sort((a, b) => (a.date < b.date ? -1 : 1))
  const last = sorted[sorted.length - 1]

  if (last.date === today) {
    // 路径 B：今天已打卡，看它与前一条之间是否恰好缺 1 天
    if (sorted.length < 2) return null
    const prev = sorted[sorted.length - 2]
    if (daysBetween(prev.date, today) !== 2) return null
    return {
      missedDate: addDays(today, -1),
      phantomStreak: prev.streak + 1,
      phantomTotal: prev.totalPoints,
      fixTodayStreak: prev.streak + 2,
    }
  }

  // 路径 A：今天还没打卡，看最后一条与今天是否恰好缺 1 天
  if (daysBetween(last.date, today) !== 2) return null
  return {
    missedDate: addDays(today, -1),
    phantomStreak: last.streak + 1,
    phantomTotal: last.totalPoints,
  }
}

/**
 * 补签资格：有可补缺口、那天不是"练了但没练够"、每月上限内、余额充足；不满足给出首个原因。
 *
 * `targetAttempted`（训练完成门槛的配套闸门，spec §5.6）：缺口日若「练了但没练够」，
 * 不可补。否则「每天挂机 30 秒 + 花分补签」就能把门槛彻底架空。
 *
 * ⚠️ 这条闸门的理由是**语义**而不是价格。补签价从 50 涨到 500 之后，挂机买连续在
 * 经济上已经很不划算了（挂机那天进账 0 还倒付 500，而认真练一天进账 360），
 * 但闸门照旧保留——补签卡是为"当天根本没机会练"（生病 / 外出）设计的，
 * 而"练了没练够"是当天可挽回的（结算页就有「再练一轮」）。别因为"现在贵了"就删掉它。
 *
 * ⚠️ 语义**不是**"那天有 session 行"。`saveSession` 只在 `phase === 'finished'`
 * （计时走满）时落库，所以"有行"真正等价的是"完整走完过一节"，拿它当判据会错两头：
 *  - 练到 40 个（远超门槛 30）却没点完成键就被收走 iPad → 有行、无打卡行 →
 *    **最该补的一天反而被永久堵死**；
 *  - 中途退出不满一节 → 一行都不落 → "点开就退出"的日子照样能花分买回连续。
 * 所以判据必须**重算那天的门槛**（`dayFellShort`，用那天各节的 elapsedSec 算）。
 *
 * 为什么"练了没练够却不能补、压根没练反而能补"不反直觉：门槛失败是**当天可挽回**的
 * （结算页就有「再练一轮」按钮，判据是当天累计），过了当天才变成缺口；
 * 而补签卡的设计意图是"当天根本没机会练"（生病/外出），那才是不可挽回的。
 */
export function canRepair(p: {
  target: RepairTarget | null
  monthRepairCount: number
  available: number
  cost: number
  targetAttempted?: boolean
}): RepairEligibility {
  if (!p.target) return { ok: false, reason: 'not-broken' }
  if (p.targetAttempted) return { ok: false, reason: 'attempted' }
  if (p.monthRepairCount >= REPAIR_MONTHLY_MAX) return { ok: false, reason: 'month-limit' }
  if (p.available < p.cost) return { ok: false, reason: 'no-points' }
  return { ok: true }
}
