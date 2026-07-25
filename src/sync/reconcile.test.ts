import { describe, it, expect } from 'vitest'
import { reconcileCheckins, repairDatesFrom } from './reconcile'
import type { CheckinRow, RedemptionRow } from '../data/db'

function ck(date: string, streak: number, dp: number, total: number): CheckinRow {
  return { date, streak, dailyPoints: dp, totalPoints: total }
}
function red(over: Partial<RedemptionRow>): RedemptionRow {
  // 显式断言：展开 Partial 会让 TS 把 kind/status 推成含 undefined 的联合，这里的固定默认值保证了不会
  return {
    kind: 'repair', title: 'repair', cost: 50, createdAt: 0, createdDate: '2026-07-21',
    status: 'fulfilled', ...over,
  } as RedemptionRow
}

describe('repairDatesFrom', () => {
  it('只取 kind=repair 且未取消的 repairDate', () => {
    const rows = [
      red({ repairDate: '2026-07-21' }),
      red({ repairDate: '2026-07-22', status: 'cancelled' }),
      red({ kind: 'reward', title: '看动画片', repairDate: undefined }),
    ]
    expect(repairDatesFrom(rows)).toEqual(['2026-07-21'])
  })

  it('忽略没有 repairDate 的补签行（脏数据不该变成 undefined 日期）', () => {
    expect(repairDatesFrom([red({ repairDate: undefined })])).toEqual([])
  })
})

describe('reconcileCheckins — 基本性质', () => {
  it('空表返回空数组', () => {
    expect(reconcileCheckins([], [])).toEqual([])
  })

  it('单设备正常链条：输出与输入完全一致（幂等，不制造无谓写盘）', () => {
    const input = [
      ck('2026-07-20', 1, 80, 80),
      ck('2026-07-21', 2, 88, 168),
      ck('2026-07-22', 3, 96, 264),
    ]
    expect(reconcileCheckins(input, [])).toEqual(input)
  })

  it('重算两次结果相同（reconcile∘reconcile = reconcile）', () => {
    const input = [ck('2026-07-22', 1, 60, 60), ck('2026-07-20', 5, 99, 99)]
    const once = reconcileCheckins(input, [])
    expect(reconcileCheckins(once, [])).toEqual(once)
  })

  it('输入乱序也按 date 升序输出', () => {
    const out = reconcileCheckins(
      [ck('2026-07-22', 9, 30, 0), ck('2026-07-20', 9, 30, 0), ck('2026-07-21', 9, 30, 0)],
      [],
    )
    expect(out.map((r) => r.date)).toEqual(['2026-07-20', '2026-07-21', '2026-07-22'])
  })
})

describe('reconcileCheckins — 多设备合并', () => {
  it('两设备交错日期：各自都以为自己 streak=1，合并后重排为 1,2,3,4', () => {
    // A 练了 20/22，B 练了 21/23，两条链各自独立累积，合并后必须整体重排
    const input = [
      ck('2026-07-20', 1, 80, 80),
      ck('2026-07-21', 1, 80, 80),
      ck('2026-07-22', 2, 88, 168),
      ck('2026-07-23', 2, 88, 168),
    ]
    const out = reconcileCheckins(input, [])
    expect(out.map((r) => r.streak)).toEqual([1, 2, 3, 4])
  })

  it('有缺口时缺口后的 streak 归 1', () => {
    const out = reconcileCheckins([ck('2026-07-20', 1, 80, 80), ck('2026-07-25', 2, 88, 168)], [])
    expect(out.map((r) => r.streak)).toEqual([1, 1])
  })

  it('totalPoints 恒等于 dailyPoints 的前缀和', () => {
    const input = [ck('2026-07-20', 9, 35, 999), ck('2026-07-21', 9, 41, 999), ck('2026-07-22', 9, 47, 999)]
    const out = reconcileCheckins(input, [])
    let acc = 0
    for (const row of out) {
      acc += row.dailyPoints
      expect(row.totalPoints).toBe(acc)
    }
  })

  it('两台设备对同一批行（顺序不同）算出完全相同的结果 —— 收敛的根据', () => {
    const a = [ck('2026-07-20', 1, 80, 80), ck('2026-07-21', 1, 80, 80), ck('2026-07-22', 7, 88, 900)]
    const b = [a[2], a[0], a[1]]
    expect(reconcileCheckins(a, [])).toEqual(reconcileCheckins(b, []))
  })
})

describe('reconcileCheckins — 只修链条、不重算货币', () => {
  it('非补签行的 dailyPoints 一字不动 —— 它是"打卡当时结算"的事实数据', () => {
    // 反向不变量。若按 sessions 重算并 Math.max 上调，两个真实场景都会白涨分：
    //  ① 一天练两轮：doCheckIn 第二轮短路返回，当天分只按第一轮结算；
    //  ② 补签之后：doRepair 只改 streak、刻意保留已赚 dailyPoints，重算会按新 coef 再抬一次。
    // 积分是能换现实奖励和补签卡的货币，登录用户不能比不登录用户多。
    const input = [ck('2026-07-20', 9, 130, 0), ck('2026-07-21', 9, 30, 0), ck('2026-07-22', 9, 250, 0)]
    const out = reconcileCheckins(input, [])
    expect(out.map((r) => r.dailyPoints)).toEqual([130, 30, 250])
  })

  it('补签补插的行 dailyPoints 恒为 0，且让后一天的 streak 接上', () => {
    // 21 日是花 50 积分补的（phantom 行），它不该反过来再发一份当日分
    const input = [ck('2026-07-20', 1, 80, 80), ck('2026-07-21', 2, 0, 80), ck('2026-07-22', 3, 88, 168)]
    const out = reconcileCheckins(input, ['2026-07-21'])
    expect(out[1].dailyPoints).toBe(0)
    expect(out.map((r) => r.streak)).toEqual([1, 2, 3])
    expect(out.map((r) => r.totalPoints)).toEqual([80, 80, 168])
  })
})
