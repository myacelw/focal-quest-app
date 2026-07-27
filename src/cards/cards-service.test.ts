import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../data/db'
import { toDateStr } from '../data/date-utils'
import { monthRepairCount } from '../rewards/ledger'
import { cardSetById } from './card-defs'
import { PACK_COST } from './pack'
import { openPack, getSetProgress } from './cards-service'

const pony = cardSetById('pony')!
const T = 1_700_000_000_000

/** 可用积分来自 checkins 链最后一行的 totalPoints */
async function seedPoints(total: number): Promise<void> {
  await db.checkins.clear()
  await db.redemptions.clear()
  await db.cards.clear()
  await db.checkins.put({ date: '2026-07-26', streak: 5, dailyPoints: 300, totalPoints: total })
}

describe('openPack', () => {
  beforeEach(async () => { await seedPoints(1000) })
  afterEach(() => { vi.restoreAllMocks() })

  it('余额够 → 给一张卡 + 记一条 pack 消耗', async () => {
    const res = await openPack('pony', T, 0.5)
    expect(res.ok).toBe(true)
    expect(await db.cards.count()).toBe(1)
    const red = (await db.redemptions.toArray())[0]
    expect(red.kind).toBe('pack')
    expect(red.title).toBe('pack')
    expect(red.cost).toBe(PACK_COST)
    // createdDate 是必填字段（漏写会让将来按月看开包量出错）。用 toDateStr 算而不是
    // 写死字符串——它按本地时区折算，写死会在别的时区红。
    expect(red.createdDate).toBe(toDateStr(new Date(T)))
  })

  it('pack 记录恒为 fulfilled —— 撤销会退分而不收回卡，等于白得一张', async () => {
    await openPack('pony', T, 0.5)
    const red = (await db.redemptions.toArray())[0]
    expect(red.status).toBe('fulfilled')
    expect(red.fulfilledAt).toBe(T)
  })

  it('开包不占补签的每月次数 —— monthRepairCount 只数 kind=repair', async () => {
    await openPack('pony', T, 0.5)
    await openPack('pony', T + 1000, 0.6)
    const month = toDateStr(new Date(T)).slice(0, 7)
    expect(monthRepairCount(await db.redemptions.toArray(), month)).toBe(0)
  })

  it('开包扣可用分：1000 分开两包后不够第三包', async () => {
    expect((await openPack('pony', T, 0.1)).ok).toBe(true)
    expect((await openPack('pony', T + 1, 0.2)).ok).toBe(true)
    const third = await openPack('pony', T + 2, 0.3)
    expect(third).toEqual({ ok: false, reason: 'no-points' })
    expect(await db.cards.count()).toBe(2)       // 失败不给卡
    expect(await db.redemptions.count()).toBe(2) // 也不扣分
  })

  it('该套集齐 → complete，不再扣分', async () => {
    await seedPoints(999_999)
    await db.cards.bulkPut(pony.cards.map((c) => ({ id: c.id, obtainedAt: 1 })))
    expect(await openPack('pony', T, 0.5)).toEqual({ ok: false, reason: 'complete' })
    expect(await db.redemptions.count()).toBe(0)
  })

  it('跨套独立：pony 集齐后仍能开 deep', async () => {
    await seedPoints(999_999)
    await db.cards.bulkPut(pony.cards.map((c) => ({ id: c.id, obtainedAt: 1 })))
    const res = await openPack('deep', T, 0.5)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.card.setId).toBe('deep')
  })

  it('记账失败时卡一起回滚 —— 绝不出现"扣了分没拿到卡"或"拿了卡没扣分"', async () => {
    vi.spyOn(db.redemptions, 'add').mockRejectedValueOnce(new Error('boom'))
    await expect(openPack('pony', T, 0.5)).rejects.toThrow()
    expect(await db.cards.count()).toBe(0)
  })

  it('未知套 id 当已集齐处理，不扣分', async () => {
    expect(await openPack('nope', T, 0.5)).toEqual({ ok: false, reason: 'complete' })
    expect(await db.redemptions.count()).toBe(0)
  })
})

describe('getSetProgress', () => {
  it('按套统计已拥有数与是否集齐', async () => {
    await seedPoints(0)
    await db.cards.bulkPut(pony.cards.slice(0, 3).map((c) => ({ id: c.id, obtainedAt: 1 })))
    expect(await getSetProgress()).toEqual([
      { setId: 'pony', owned: 3, total: 32, complete: false },
      { setId: 'deep', owned: 0, total: 32, complete: false },
    ])
  })
})
