import type { RedemptionRow, CheckinRow } from '../data/db'
import { daysBetween, monthOf, addDays } from '../data/date-utils'

/** 补签价（中等价，约 1–2 天打卡分；改这一处即可调价） */
export const REPAIR_COST = 50

/** 可用积分 = 累计赚取 − Σ(未取消消耗)，不为负 */
export function availablePoints(totalEarned: number, redemptions: RedemptionRow[]): number {
  const spent = redemptions
    .filter((r) => r.status !== 'cancelled')
    .reduce((sum, r) => sum + r.cost, 0)
  return Math.max(0, totalEarned - spent)
}

/** 当月（本地 YYYY-MM）已用补签次数 */
export function monthRepairCount(redemptions: RedemptionRow[], monthStr: string): number {
  return redemptions.filter(
    (r) => r.kind === 'repair' && r.status !== 'cancelled' && monthOf(r.createdDate) === monthStr,
  ).length
}

export type RepairReason = 'not-broken' | 'no-points' | 'month-limit'
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

/** 补签资格：有可补缺口、每月上限内、余额充足；不满足给出首个原因 */
export function canRepair(p: {
  target: RepairTarget | null
  monthRepairCount: number
  available: number
  cost: number
}): RepairEligibility {
  if (!p.target) return { ok: false, reason: 'not-broken' }
  if (p.monthRepairCount >= 2) return { ok: false, reason: 'month-limit' }
  if (p.available < p.cost) return { ok: false, reason: 'no-points' }
  return { ok: true }
}
