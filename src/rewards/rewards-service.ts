import { db, type RewardRow, type RedemptionRow, type CheckinRow } from '../data/db'
import { availablePoints, monthRepairCount, canRepair, findRepairTarget, REPAIR_COST, type RepairEligibility } from './ledger'
import { toDateStr, addDays, monthOf } from '../data/date-utils'
import { pushRewards, pushRedemptions, pushCheckin } from '../data/api'

/** 最新累计积分（来自 checkins 链的最后一条） */
async function latestTotalPoints(): Promise<number> {
  const last = await db.checkins.orderBy('date').last()
  return last ? last.totalPoints : 0
}

/** 上架奖励（active），家长与孩子都看这一份 */
export async function listRewards(): Promise<RewardRow[]> {
  const all = await db.rewards.toArray()
  return all.filter((r) => r.active).sort((a, b) => a.cost - b.cost)
}

export async function addReward(title: string, cost: number): Promise<void> {
  const row: RewardRow = { title, cost, active: true, createdAt: Date.now() }
  const id = await db.rewards.add(row)
  pushRewards([{ ...row, id }])
}

/** 软删：置 active=false，历史兑换名称快照不受影响 */
export async function deactivateReward(id: number): Promise<void> {
  await db.rewards.update(id, { active: false })
  const row = await db.rewards.get(id)
  if (row) pushRewards([row])
}

/** 可用积分 = 累计 − 未取消消耗 */
export async function getAvailablePoints(): Promise<number> {
  const [total, reds] = await Promise.all([latestTotalPoints(), db.redemptions.toArray()])
  return availablePoints(total, reds)
}

export async function listRedemptions(): Promise<RedemptionRow[]> {
  const all = await db.redemptions.toArray()
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function listPending(): Promise<RedemptionRow[]> {
  return (await listRedemptions()).filter((r) => r.status === 'pending')
}

/** 孩子申请兑换：预扣（记 pending）。余额不足或奖励失效返回 null */
export async function requestRedemption(rewardId: number): Promise<RedemptionRow | null> {
  const reward = await db.rewards.get(rewardId)
  if (!reward || !reward.active) return null
  const available = await getAvailablePoints()
  if (available < reward.cost) return null
  const now = Date.now()
  const row: RedemptionRow = {
    kind: 'reward', title: reward.title, cost: reward.cost,
    createdAt: now, createdDate: toDateStr(new Date(now)), status: 'pending',
  }
  const id = await db.redemptions.add(row)
  const saved = { ...row, id }
  pushRedemptions([saved])
  return saved
}

/** 家长确认已兑现 */
export async function fulfillRedemption(id: number): Promise<void> {
  await db.redemptions.update(id, { status: 'fulfilled', fulfilledAt: Date.now() })
  const row = await db.redemptions.get(id)
  if (row) pushRedemptions([row])
}

/** 家长取消：退回可用积分 */
export async function cancelRedemption(id: number): Promise<void> {
  await db.redemptions.update(id, { status: 'cancelled' })
  const row = await db.redemptions.get(id)
  if (row) pushRedemptions([row])
}

export interface RepairStatus extends RepairEligibility {
  streak: number       // 补签后可保住/达到的连续天数
  cost: number
  missedDate: string   // 漏掉的那天（= 昨天）
}

/** 首页补签横幅所需状态。缺口检测基于整条 checkins 链，故当天打卡前后都能正确判定。 */
export async function getRepairStatus(today: string): Promise<RepairStatus> {
  const [checkins, available, reds] = await Promise.all([
    db.checkins.toArray(),
    getAvailablePoints(),
    db.redemptions.toArray(),
  ])
  const target = findRepairTarget(checkins, today)
  const elig = canRepair({
    target,
    monthRepairCount: monthRepairCount(reds, monthOf(today)),
    available,
    cost: REPAIR_COST,
  })
  return {
    ...elig,
    // 补签后可见的连续天数：今天已打卡→修正值，否则→补插行 streak
    streak: target ? (target.fixTodayStreak ?? target.phantomStreak) : 0,
    cost: REPAIR_COST,
    missedDate: target ? target.missedDate : addDays(today, -1),
  }
}

/**
 * 执行补签：记消耗（fulfilled）+ 补插漏掉那天的打卡行；若今天已打卡且被重置，
 * 顺带把今天行的 streak 接续上去（防止"先打卡后补签"丢连续）。返回是否成功。
 */
export async function doRepair(today: string): Promise<boolean> {
  const [checkins, available, reds] = await Promise.all([
    db.checkins.toArray(),
    getAvailablePoints(),
    db.redemptions.toArray(),
  ])
  const target = findRepairTarget(checkins, today)
  const elig = canRepair({ target, monthRepairCount: monthRepairCount(reds, monthOf(today)), available, cost: REPAIR_COST })
  if (!elig.ok || !target) return false

  const now = Date.now()
  const redemption: RedemptionRow = {
    kind: 'repair', title: 'repair', cost: REPAIR_COST,
    createdAt: now, createdDate: toDateStr(new Date(now)),
    status: 'fulfilled', fulfilledAt: now, repairDate: target.missedDate,
  }
  const phantom: CheckinRow = {
    date: target.missedDate, streak: target.phantomStreak, dailyPoints: 0, totalPoints: target.phantomTotal,
  }
  const id = await db.redemptions.add(redemption)
  await db.checkins.put(phantom)
  pushRedemptions([{ ...redemption, id }])
  pushCheckin(phantom)

  // 路径 B：今天已打卡被重置，把今天行接续（只改 streak，保留已赚 dailyPoints/totalPoints）
  if (target.fixTodayStreak !== undefined) {
    const todayRow = checkins.find((c) => c.date === today)
    if (todayRow) {
      const fixed: CheckinRow = { ...todayRow, streak: target.fixTodayStreak }
      await db.checkins.put(fixed)
      pushCheckin(fixed)
    }
  }
  return true
}
