import { describe, it, expect } from 'vitest'
import {
  REPAIR_COST, REPAIR_MONTHLY_MAX, availablePoints, monthRepairCount, canRepair, findRepairTarget, overspend,
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
  // available 取一个明显够的值，别贴着 REPAIR_COST 写——贴着写的话这条"有分"的用例
  // 会在下一次调价时变成边界用例，而它想验的根本不是边界
  const base = { target, monthRepairCount: 0, available: 999_999, cost: REPAIR_COST }
  it('有缺口 + 有分 + 未超限：可补', () => {
    expect(canRepair(base)).toEqual({ ok: true })
  })
  it('无缺口：not-broken', () => {
    expect(canRepair({ ...base, target: null })).toEqual({ ok: false, reason: 'not-broken' })
  })
  it('本月已补 3 次：month-limit', () => {
    expect(canRepair({ ...base, monthRepairCount: 3 })).toEqual({ ok: false, reason: 'month-limit' })
  })
  it('可用分不足：no-points', () => {
    expect(canRepair({ ...base, available: 10 })).toEqual({ ok: false, reason: 'no-points' })
  })
})

describe('补签定价（改这两个常量即可调价 / 调松紧）', () => {
  const target = { missedDate: '2026-07-19', phantomStreak: 3, phantomTotal: 100, fixTodayStreak: undefined }

  it('补签 500 分、每月上限 3 次', () => {
    expect(REPAIR_COST).toBe(500)
    expect(REPAIR_MONTHLY_MAX).toBe(3)
  })

  it('到达上限 → month-limit（判据用常量，不是裸数字）', () => {
    expect(canRepair({ target, monthRepairCount: REPAIR_MONTHLY_MAX, available: 999_999, cost: REPAIR_COST }))
      .toEqual({ ok: false, reason: 'month-limit' })
  })

  it('本月已补 2 次仍可补 —— 上限从 2 放宽到 3 的回归锚', () => {
    expect(canRepair({ target, monthRepairCount: 2, available: 999_999, cost: REPAIR_COST }))
      .toEqual({ ok: true })
  })
})

describe('overspend — 多设备并发兑换会超支，必须让家长看得见', () => {
  it('未超支时为 0', () => {
    expect(overspend(500, [red({ cost: 100 })])).toBe(0)
    expect(overspend(500, [red({ cost: 500 })])).toBe(0)
  })

  it('两台设备各兑换一次 → 消耗翻倍 → 报出超支分数', () => {
    // availablePoints 会把结果夹到 0，家长在 UI 上完全看不出来；这个函数专门把它挖出来
    expect(overspend(500, [red({ cost: 400 }), red({ cost: 400 })])).toBe(300)
  })

  it('已取消的消耗不计（家长取消一条即可把超支纠正回来）', () => {
    expect(overspend(500, [red({ cost: 400 }), red({ cost: 400, status: 'cancelled' })])).toBe(0)
  })
})

describe('canRepair：训练完成门槛的配套闸门', () => {
  const target = { missedDate: '2026-07-26', phantomStreak: 4, phantomTotal: 800 }

  it('缺口日练了但没练够 → attempted，不可补', () => {
    // 不堵这里，门槛的成本就只是 50 分——比认真练一轮还便宜。
    expect(canRepair({ target, targetAttempted: true, monthRepairCount: 0, available: 999, cost: 50 }))
      .toEqual({ ok: false, reason: 'attempted' })
  })

  it('attempted 排在 month-limit / no-points 之前（先说清根本原因，别让家长以为是次数或余额问题）', () => {
    const r = canRepair({ target, targetAttempted: true, monthRepairCount: 2, available: 0, cost: 50 })
    expect(r.reason).toBe('attempted')
  })

  it('没缺口时仍是 not-broken（attempted 不能盖住它）', () => {
    expect(canRepair({ target: null, targetAttempted: true, monthRepairCount: 0, available: 999, cost: 50 }).reason)
      .toBe('not-broken')
  })

  it('缺省 targetAttempted 时行为与从前完全一致（完全没练的日子照样能补）', () => {
    expect(canRepair({ target, monthRepairCount: 0, available: 999, cost: 50 })).toEqual({ ok: true })
    // monthRepairCount 必须用 REPAIR_MONTHLY_MAX 而不是写死的数字：
    // 月上限从 2 调到 3 时，写死 2 的话这条会静默变成"未超限"，断言随之失效
    expect(canRepair({ target, targetAttempted: false, monthRepairCount: REPAIR_MONTHLY_MAX, available: 999, cost: 50 }).reason)
      .toBe('month-limit')
  })

  it('targetAttempted 的语义是「练了但没练够」，不是「那天有记录」——练够却没点完成键的日子必须传 false（仍可补）', () => {
    // 判据由 dayFellShort 算（goal.test.ts 锚定），这里锚定的是 canRepair 的契约：
    // 服务层一旦把它退化成 "sessions.count() > 0"，最该补的那天（练到 40 个、
    // 门槛 30，却被收走 iPad 没点按钮）就会被永久堵死。
    expect(canRepair({ target, targetAttempted: false, monthRepairCount: 0, available: 999, cost: 50 }))
      .toEqual({ ok: true })
  })
})
