import { db, type RewardRow, type RedemptionRow, type CheckinRow } from '../data/db'
import { availablePoints, monthRepairCount, canRepair, buildRepairCheckin, REPAIR_COST, type RepairEligibility } from './ledger'
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

export async function updateReward(id: number, patch: { title: string; cost: number }): Promise<void> {
  await db.rewards.update(id, patch)
  const row = await db.rewards.get(id)
  if (row) pushRewards([row])
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
  streak: number       // 补签后可保住的连续天数（= 上次真实 streak）
  cost: number
  missedDate: string   // 漏掉的那天（= 昨天）
}

/** 首页补签横幅所需状态 */
export async function getRepairStatus(today: string): Promise<RepairStatus> {
  const last = await db.checkins.orderBy('date').last()
  const [available, reds] = await Promise.all([getAvailablePoints(), db.redemptions.toArray()])
  const elig = canRepair({
    lastCheckinDate: last ? last.date : null,
    today,
    monthRepairCount: monthRepairCount(reds, monthOf(today)),
    available,
    cost: REPAIR_COST,
  })
  return { ...elig, streak: last ? last.streak : 0, cost: REPAIR_COST, missedDate: addDays(today, -1) }
}

/** 执行补签：记消耗（fulfilled）+ 补插打卡行。返回是否成功 */
export async function doRepair(today: string): Promise<boolean> {
  const status = await getRepairStatus(today)
  if (!status.ok) return false
  const last = await db.checkins.orderBy('date').last()
  if (!last) return false
  const now = Date.now()
  const redemption: RedemptionRow = {
    kind: 'repair', title: 'repair', cost: status.cost,
    createdAt: now, createdDate: toDateStr(new Date(now)),
    status: 'fulfilled', fulfilledAt: now, repairDate: status.missedDate,
  }
  const checkinRow: CheckinRow = buildRepairCheckin(last, status.missedDate)
  const id = await db.redemptions.add(redemption)
  await db.checkins.put(checkinRow)
  pushRedemptions([{ ...redemption, id }])
  pushCheckin(checkinRow)
  return true
}
