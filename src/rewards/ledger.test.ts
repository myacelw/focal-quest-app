import { describe, it, expect } from 'vitest'
import {
  REPAIR_COST, availablePoints, monthRepairCount, canRepair, findRepairTarget,
} from './ledger'
import type { RedemptionRow, CheckinRow } from '../data/db'

function ck(date: string, streak: number, totalPoints = 800): CheckinRow {
  return { date, streak, dailyPoints: 0, totalPoints }
}

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

describe('findRepairTarget', () => {
  const today = '2026-07-03'

  it('未打卡 + 恰好漏 1 天：补插昨天、接续 streak', () => {
    // 周一(07-01)打卡 streak5，周二漏，今天(07-03)还没打卡
    const target = findRepairTarget([ck('2026-07-01', 5)], today)
    expect(target).toEqual({
      missedDate: '2026-07-02',
      phantomStreak: 6,
      phantomTotal: 800,
      fixTodayStreak: undefined,
    })
  })

  it('今天已打卡且已被重置：补插昨天并把今天 streak 接续', () => {
    // 周一 streak5、周二漏、今天(07-03)已打卡但被重置为 1
    const target = findRepairTarget([ck('2026-07-01', 5, 800), ck('2026-07-03', 1, 900)], today)
    expect(target).toEqual({
      missedDate: '2026-07-02',
      phantomStreak: 6,
      phantomTotal: 800,      // 沿用缺口前一天（周一），不是今天
      fixTodayStreak: 7,      // 今天行从 1 修正为 7
    })
  })

  it('昨天打过卡（未断）：无缺口', () => {
    expect(findRepairTarget([ck('2026-07-02', 5)], today)).toBeNull()
  })

  it('连漏 2+ 天：不可补', () => {
    expect(findRepairTarget([ck('2026-06-30', 5)], today)).toBeNull()
  })

  it('今天已打卡但上一条是连漏 2 天：不可补', () => {
    expect(findRepairTarget([ck('2026-06-30', 5), ck('2026-07-03', 1)], today)).toBeNull()
  })

  it('从无打卡记录：不可补', () => {
    expect(findRepairTarget([], today)).toBeNull()
  })

  it('乱序输入也能正确排序判定', () => {
    const target = findRepairTarget([ck('2026-07-03', 1, 900), ck('2026-07-01', 5, 800)], today)
    expect(target?.missedDate).toBe('2026-07-02')
    expect(target?.fixTodayStreak).toBe(7)
  })
})

describe('canRepair', () => {
  const target = { missedDate: '2026-07-02', phantomStreak: 6, phantomTotal: 800, fixTodayStreak: undefined }
  const base = { target, monthRepairCount: 0, available: 500, cost: REPAIR_COST }
  it('有缺口 + 有分 + 未超限：可补', () => {
    expect(canRepair(base)).toEqual({ ok: true })
  })
  it('无缺口：not-broken', () => {
    expect(canRepair({ ...base, target: null })).toEqual({ ok: false, reason: 'not-broken' })
  })
  it('本月已补 2 次：month-limit', () => {
    expect(canRepair({ ...base, monthRepairCount: 2 })).toEqual({ ok: false, reason: 'month-limit' })
  })
  it('可用分不足：no-points', () => {
    expect(canRepair({ ...base, available: 10 })).toEqual({ ok: false, reason: 'no-points' })
  })
})
