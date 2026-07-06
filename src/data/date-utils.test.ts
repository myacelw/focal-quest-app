import { describe, it, expect } from 'vitest'
import { toDateStr, addDays, isYesterday } from './date-utils'

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
