import { describe, it, expect } from 'vitest'
import { toDateStr, addDays, isYesterday, daysBetween, monthOf } from './date-utils'

describe('toDateStr', () => {
  it('formats local Y-M-D zero-padded', () => {
    expect(toDateStr(new Date(2026, 6, 6))).toBe('2026-07-06') // month is 0-indexed → July
  })
})

describe('addDays', () => {
  it('adds a day', () => {
    expect(addDays('2026-07-06', 1)).toBe('2026-07-07')
  })
  it('rolls across month end', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01')
  })
  it('rolls back across year start', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('isYesterday', () => {
  it('true when dateStr is the day before today', () => {
    expect(isYesterday('2026-07-05', '2026-07-06')).toBe(true)
  })
  it('false otherwise', () => {
    expect(isYesterday('2026-07-04', '2026-07-06')).toBe(false)
    expect(isYesterday('2026-07-06', '2026-07-06')).toBe(false)
  })
})

describe('daysBetween', () => {
  it('相邻两天差 1', () => {
    expect(daysBetween('2026-07-01', '2026-07-02')).toBe(1)
  })
  it('漏一天=差 2（上次打卡→今天）', () => {
    expect(daysBetween('2026-07-01', '2026-07-03')).toBe(2)
  })
  it('同一天差 0', () => {
    expect(daysBetween('2026-07-05', '2026-07-05')).toBe(0)
  })
  it('跨月正确（无时区漂移）', () => {
    expect(daysBetween('2026-06-30', '2026-07-01')).toBe(1)
  })
  it('反向为负', () => {
    expect(daysBetween('2026-07-03', '2026-07-01')).toBe(-2)
  })
})

describe('monthOf', () => {
  it('取 YYYY-MM', () => {
    expect(monthOf('2026-07-10')).toBe('2026-07')
  })
})
