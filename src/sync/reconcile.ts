import type { CheckinRow, RedemptionRow } from '../data/db'
import { nextStreak } from '../data/streak'

/** 补签补插的日期：kind='repair' 且未取消的兑换记录所补的那天 */
export function repairDatesFrom(redemptions: RedemptionRow[]): string[] {
  const out: string[] = []
  for (const r of redemptions) {
    if (r.kind === 'repair' && r.status !== 'cancelled' && typeof r.repairDate === 'string' && r.repairDate) {
      out.push(r.repairDate)
    }
  }
  return out
}

/**
 * 打卡链整体重算（spec §6.5，多设备正确性的关键）。
 *
 * 为什么必须重算：streak / totalPoints 是**链式累积写死在行里**的
 * （doCheckIn：totalPoints = 上一条.totalPoints + dailyPoints）。两台设备各自打卡不同日期后
 * 合并，每行都"自认为"接着自己那条链，链条必然错乱——LWW 只能选出某一行，修不了链。
 *
 * 三条口径（都有单测锚定）：
 *  1. 按 date 升序重排 streak（复用既有 nextStreak）；
 *  2. totalPoints = dailyPoints 前缀和；
 *  3. **dailyPoints 一律沿用行内原值**，只有补签补插的行（date ∈ repairDates）强制 0
 *     ——补签是花积分买回的连续，不该反过来再发一份当日分。
 *
 * ⚠️ 第 3 条是硬口径，**不要"优化"成按 sessions 重算**（哪怕加 Math.max 只涨不跌也不行）：
 *  - 一天练两轮时，`doCheckIn()` 第二轮直接短路返回，当天分只按第一轮的答对数结算；
 *    按当天全部 sessions 重算必然更大 → 每个练过两轮的日子在首次同步时白涨分。
 *  - 补签之后，`doRepair()` 刻意"只改 streak、保留已赚 dailyPoints"；重算会按抬高后的
 *    streak 用更大的 coef 再算一遍，又涨一次。
 * 积分是能换现实奖励和补签卡的**货币**（见 rewards/ledger.ts），登录用户不能比不登录用户多。
 * dailyPoints 是"打卡当时结算"的事实数据，不是可随时重新推导的派生值。
 *
 * 沿用原值还带来一个关键性质：本函数**严格幂等**、且只依赖 (date, dailyPoints, repairDates)，
 * 所以两台设备算出完全相同的结果 → changed 为空 → 不会来回互推打乒乓。
 */
export function reconcileCheckins(
  checkins: CheckinRow[],
  repairDates: readonly string[],
): CheckinRow[] {
  const repaired = new Set(repairDates)
  const sorted = [...checkins].sort((a, b) => (a.date < b.date ? -1 : 1))
  const out: CheckinRow[] = []
  let prev: CheckinRow | null = null
  for (const row of sorted) {
    const streak = nextStreak(prev ? { date: prev.date, streak: prev.streak } : null, row.date)
    const dp = repaired.has(row.date) ? 0 : row.dailyPoints
    const totalPoints = (prev ? prev.totalPoints : 0) + dp
    const fixed: CheckinRow = { ...row, streak, dailyPoints: dp, totalPoints }
    out.push(fixed)
    prev = fixed
  }
  return out
}
