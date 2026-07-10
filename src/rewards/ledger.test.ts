import { describe, it, expect } from 'vitest'
import {
  REPAIR_COST, availablePoints, monthRepairCount, canRepair, buildRepairCheckin,
} from './ledger'
import type { RedemptionRow } from '../data/db'

function red(over: Partial<RedemptionRow>): RedemptionRow {
  return {
    kind: 'reward', title: 'x', cost: 100, createdAt: 0,
    createdDate: '2026-07-10', status: 'pending', ...over,
  }
}

describe('availablePoints', () => {
  it('无消耗时 = 累计', () => {
    expect(availablePoints(500, [])).toBe(500)
  })
  it('扣除 pending + fulfilled，排除 cancelled', () => {
    const reds = [
      red({ cost: 100, status: 'pending' }),
      red({ cost: 200, status: 'fulfilled' }),
      red({ cost: 300, status: 'cancelled' }),
    ]
    expect(availablePoints(500, reds)).toBe(200) // 500 - 100 - 200
  })
  it('不为负', () => {
    expect(availablePoints(50, [red({ cost: 100, status: 'fulfilled' })])).toBe(0)
  })
})

describe('monthRepairCount', () => {
  it('只数当月 kind=repair 且非取消', () => {
    const reds = [
      red({ kind: 'repair', status: 'fulfilled', createdDate: '2026-07-02' }),
      red({ kind: 'repair', status: 'fulfilled', createdDate: '2026-07-20' }),
      red({ kind: 'repair', status: 'fulfilled', createdDate: '2026-06-30' }), // 上月
      red({ kind: 'reward', status: 'fulfilled', createdDate: '2026-07-05' }), // 非补签
    ]
    expect(monthRepairCount(reds, '2026-07')).toBe(2)
  })
})

describe('canRepair', () => {
  const base = { today: '2026-07-03', monthRepairCount: 0, available: 500, cost: REPAIR_COST }
  it('恰好漏 1 天可补', () => {
    expect(canRepair({ ...base, lastCheckinDate: '2026-07-01' })).toEqual({ ok: true })
  })
  it('没断（昨天打过卡）不可补', () => {
    expect(canRepair({ ...base, lastCheckinDate: '2026-07-02' }))
      .toEqual({ ok: false, reason: 'not-broken' })
  })
  it('连漏 2+ 天不可补', () => {
    expect(canRepair({ ...base, lastCheckinDate: '2026-06-30' }))
      .toEqual({ ok: false, reason: 'not-broken' })
  })
  it('从无打卡记录不可补', () => {
    expect(canRepair({ ...base, lastCheckinDate: null }))
      .toEqual({ ok: false, reason: 'not-broken' })
  })
  it('本月已补 2 次不可补', () => {
    expect(canRepair({ ...base, lastCheckinDate: '2026-07-01', monthRepairCount: 2 }))
      .toEqual({ ok: false, reason: 'month-limit' })
  })
  it('可用分不足不可补', () => {
    expect(canRepair({ ...base, lastCheckinDate: '2026-07-01', available: 10 }))
      .toEqual({ ok: false, reason: 'no-points' })
  })
})

describe('buildRepairCheckin', () => {
  it('补插行接续 streak、0 分、totalPoints 沿用', () => {
    const row = buildRepairCheckin({ streak: 5, totalPoints: 800 }, '2026-07-02')
    expect(row).toEqual({ date: '2026-07-02', streak: 6, dailyPoints: 0, totalPoints: 800 })
  })
})
