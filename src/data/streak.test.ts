import { describe, it, expect } from 'vitest'
import { nextStreak, currentStreak } from './streak'

describe('nextStreak', () => {
  it('first ever check-in → 1', () => {
    expect(nextStreak(null, '2026-07-06')).toBe(1)
  })
  it('checked in yesterday → +1', () => {
    expect(nextStreak({ date: '2026-07-05', streak: 3 }, '2026-07-06')).toBe(4)
  })
  it('already checked in today → unchanged', () => {
    expect(nextStreak({ date: '2026-07-06', streak: 3 }, '2026-07-06')).toBe(3)
  })
  it('gap of 2+ days → reset to 1', () => {
    expect(nextStreak({ date: '2026-07-04', streak: 3 }, '2026-07-06')).toBe(1)
  })
})

describe('currentStreak', () => {
  it('null → 0', () => {
    expect(currentStreak(null, '2026-07-06')).toBe(0)
  })
  it('checked in today → its streak', () => {
    expect(currentStreak({ date: '2026-07-06', streak: 5 }, '2026-07-06')).toBe(5)
  })
  it('checked in yesterday → still valid', () => {
    expect(currentStreak({ date: '2026-07-05', streak: 5 }, '2026-07-06')).toBe(5)
  })
  it('older than yesterday → broken → 0', () => {
    expect(currentStreak({ date: '2026-07-04', streak: 5 }, '2026-07-06')).toBe(0)
  })
})
