import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../data/db'
import { doRepair } from './rewards-service'
import { REPAIR_COST } from './ledger'

/**
 * 造出「前天打过卡、昨天漏了、今天还没打」的可补局面，并给足积分。
 *
 * 刻意**不塞 sessions**：门槛闸门 `fellShortOn` 会重算缺口日的门槛，
 * 而 `dayFellShort(0, [])` 返回 false（"那天压根没练 → 可补"，正是补签卡的设计意图）。
 */
const SEED_TOTAL = REPAIR_COST * 2

async function seedRepairable(): Promise<void> {
  await db.checkins.clear()
  await db.redemptions.clear()
  await db.sessions.clear()
  // 前天：streak 3，累计分从 REPAIR_COST 派生而不是写死——涨价时这个 fixture 就不会
  // 悄悄变成"钱不够"而让整组用例红掉（500→2000 那次正是这么红的）。
  await db.checkins.put({ date: '2026-07-25', streak: 3, dailyPoints: 300, totalPoints: SEED_TOTAL })
}

describe('doRepair 的原子性', () => {
  beforeEach(async () => { await seedRepairable() })
  afterEach(() => { vi.restoreAllMocks() })

  it('成功时两张表都写：兑换记录 + 补插的打卡行', async () => {
    expect(await doRepair('2026-07-27')).toBe(true)
    expect(await db.redemptions.count()).toBe(1)
    const phantom = await db.checkins.get('2026-07-26')
    expect(phantom?.streak).toBe(4)
    expect(phantom?.dailyPoints).toBe(0)     // 补插行不虚涨积分
    expect(phantom?.totalPoints).toBe(SEED_TOTAL)  // 累计沿用缺口前一天
  })

  it('补插打卡失败时兑换记录一起回滚 —— 绝不出现"扣了分却没补上签"', async () => {
    // 不包事务的话 redemptions.add 已经落了盘，孩子白掉一笔分而连续天数没保住，
    // 且账本对不上没法自动修（家长只能去奖励页手动取消那条消耗）。
    vi.spyOn(db.checkins, 'put').mockRejectedValueOnce(new Error('boom'))
    await expect(doRepair('2026-07-27')).rejects.toThrow()
    expect(await db.redemptions.count()).toBe(0)
  })
})
