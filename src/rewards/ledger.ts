import type { RedemptionRow, CheckinRow } from '../data/db'
import { daysBetween, monthOf } from '../data/date-utils'

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

/** 补签资格：只补恰好漏 1 天、每月上限、余额充足；不满足给出首个原因 */
export function canRepair(p: {
  lastCheckinDate: string | null
  today: string
  monthRepairCount: number
  available: number
  cost: number
}): RepairEligibility {
  // 恰好漏 1 天 = 上次打卡在今天的前 2 天（昨天没练）
  if (p.lastCheckinDate === null || daysBetween(p.lastCheckinDate, p.today) !== 2) {
    return { ok: false, reason: 'not-broken' }
  }
  if (p.monthRepairCount >= 2) return { ok: false, reason: 'month-limit' }
  if (p.available < p.cost) return { ok: false, reason: 'no-points' }
  return { ok: true }
}

/** 补插的打卡行：接续 streak、0 分、totalPoints 沿用上一条（累计链不虚涨） */
export function buildRepairCheckin(
  lastReal: { streak: number; totalPoints: number },
  missedDate: string,
): CheckinRow {
  return { date: missedDate, streak: lastReal.streak + 1, dailyPoints: 0, totalPoints: lastReal.totalPoints }
}
