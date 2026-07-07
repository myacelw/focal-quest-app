import { describe, it, expect } from 'vitest'
import { weekKey, monthKey } from './period'

// 2024-01-01 是星期一（锚点）
describe('weekKey (week starts Monday)', () => {
  it('a Monday maps to itself', () => {
    expect(weekKey('2024-01-01')).toBe('2024-01-01')
  })
  it('a Wednesday maps to that Monday', () => {
    expect(weekKey('2024-01-03')).toBe('2024-01-01')
  })
  it('a Sunday maps to that week Monday', () => {
    expect(weekKey('2024-01-07')).toBe('2024-01-01')
  })
  it('next Monday starts a new week', () => {
    expect(weekKey('2024-01-08')).toBe('2024-01-08')
  })
})

describe('monthKey', () => {
  it('is YYYY-MM', () => {
    expect(monthKey('2026-07-07')).toBe('2026-07')
  })
})
