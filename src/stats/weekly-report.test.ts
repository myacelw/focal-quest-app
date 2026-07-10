import { describe, it, expect } from 'vitest'
import { weeklyReport, weeklyExtras } from './weekly-report'
import type { SessionRow, RedemptionRow } from '../data/db'

// 2026-07-08 是周三；本周一 2026-07-06，上周一 2026-06-29
const TODAY = '2026-07-08'

function s(date: string, correct: number, answered: number, avgReactionMs?: number): SessionRow {
  return { date, startedAtMs: 0, eye: 'left', answered, correct, flips: 0, elapsedSec: 180, acuity: 0.8, avgReactionMs }
}

describe('weeklyReport', () => {
  it('本周无记录 → 提示开始', () => {
    const r = weeklyReport([], TODAY)
    expect(r.thisWeekCount).toBe(0)
    expect(r.suggestionKey).toBe('suggest.noSessions')
  })

  it('统计本周/上周次数', () => {
    const r = weeklyReport([s('2026-07-07', 5, 5), s('2026-07-08', 4, 5), s('2026-06-30', 3, 5)], TODAY)
    expect(r.thisWeekCount).toBe(2)
    expect(r.lastWeekCount).toBe(1)
  })

  it('高正确率 → 建议调小视标（难度进阶）', () => {
    const r = weeklyReport([s('2026-07-07', 10, 10, 1500)], TODAY)
    expect(r.accuracy).toBe(1)
    expect(r.suggestionKey).toBe('suggest.highAccuracy')
  })

  it('反应比上周快 → 进步鼓励', () => {
    const r = weeklyReport([s('2026-07-07', 6, 10, 1200), s('2026-06-30', 6, 10, 2000)], TODAY)
    expect(r.reactionTrend).toBe('faster')
    expect(r.avgReactionSec).toBe(1.2)
    expect(r.suggestionKey).toBe('suggest.reactionFaster')
  })

  it('正确率偏低 → 提醒家长', () => {
    const r = weeklyReport([s('2026-07-07', 3, 10, 1500)], TODAY)
    expect(r.suggestionKey).toBe('suggest.lowAccuracy')
  })

  it('缺一周数据 → 趋势为 null', () => {
    const r = weeklyReport([s('2026-07-07', 7, 10, 1500)], TODAY)
    expect(r.reactionTrend).toBeNull()
  })
})

function red(over: Partial<RedemptionRow>): RedemptionRow {
  return { kind: 'reward', title: 'x', cost: 10, createdAt: 0, createdDate: '2026-07-08', status: 'fulfilled', ...over }
}
// 2026-07-08 是周三，本周（周一起始）= 2026-07-06..07-12
const inWeek = new Date('2026-07-08T10:00:00').getTime()
const lastWeek = new Date('2026-06-30T10:00:00').getTime()

describe('weeklyExtras', () => {
  it('统计本周捕获怪兽数（按 capturedAt 落在本周）', () => {
    const r = weeklyExtras(
      [{ capturedAt: inWeek }, { capturedAt: inWeek }, { capturedAt: lastWeek }],
      [], TODAY,
    )
    expect(r.monstersThisWeek).toBe(2)
  })
  it('只收本周 已兑现 reward 的名称', () => {
    const r = weeklyExtras([], [
      red({ title: '看动画', status: 'fulfilled', createdDate: '2026-07-07' }),
      red({ title: '待确认的', status: 'pending', createdDate: '2026-07-07' }),   // 非 fulfilled 排除
      red({ title: '补签', kind: 'repair', status: 'fulfilled', createdDate: '2026-07-07' }), // 非 reward 排除
      red({ title: '上周的', status: 'fulfilled', createdDate: '2026-06-30' }),   // 跨周排除
    ], TODAY)
    expect(r.redeemedTitlesThisWeek).toEqual(['看动画'])
  })
  it('空输入返回 0 与空数组', () => {
    const r = weeklyExtras([], [], TODAY)
    expect(r).toEqual({ monstersThisWeek: 0, redeemedTitlesThisWeek: [] })
  })
})
