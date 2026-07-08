import { describe, it, expect } from 'vitest'
import { weeklyReport } from './weekly-report'
import type { SessionRow } from '../data/db'

// 2026-07-08 是周三；本周一 2026-07-06，上周一 2026-06-29
const TODAY = '2026-07-08'

function s(date: string, correct: number, answered: number, avgReactionMs?: number): SessionRow {
  return { date, startedAtMs: 0, eye: 'left', answered, correct, flips: 0, elapsedSec: 180, acuity: 0.8, avgReactionMs }
}

describe('weeklyReport', () => {
  it('本周无记录 → 提示开始', () => {
    const r = weeklyReport([], TODAY)
    expect(r.thisWeekCount).toBe(0)
    expect(r.suggestion).toContain('今天开始')
  })

  it('统计本周/上周次数', () => {
    const r = weeklyReport([s('2026-07-07', 5, 5), s('2026-07-08', 4, 5), s('2026-06-30', 3, 5)], TODAY)
    expect(r.thisWeekCount).toBe(2)
    expect(r.lastWeekCount).toBe(1)
  })

  it('高正确率 → 建议调小视标（难度进阶）', () => {
    const r = weeklyReport([s('2026-07-07', 10, 10, 1500)], TODAY)
    expect(r.accuracy).toBe(1)
    expect(r.suggestion).toContain('视标调小')
  })

  it('反应比上周快 → 进步鼓励', () => {
    const r = weeklyReport([s('2026-07-07', 6, 10, 1200), s('2026-06-30', 6, 10, 2000)], TODAY)
    expect(r.reactionTrend).toBe('faster')
    expect(r.avgReactionSec).toBe(1.2)
    expect(r.suggestion).toContain('进步')
  })

  it('正确率偏低 → 提醒家长', () => {
    const r = weeklyReport([s('2026-07-07', 3, 10, 1500)], TODAY)
    expect(r.suggestion).toContain('正确率偏低')
  })

  it('缺一周数据 → 趋势为 null', () => {
    const r = weeklyReport([s('2026-07-07', 7, 10, 1500)], TODAY)
    expect(r.reactionTrend).toBeNull()
  })
})
