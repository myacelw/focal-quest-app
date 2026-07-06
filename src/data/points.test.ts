import { describe, it, expect } from 'vitest'
import { coef, dailyPoints } from './points'

describe('coef', () => {
  it('streak 1 → 1.0', () => {
    expect(coef(1)).toBeCloseTo(1.0, 6)
  })
  it('streak 6 → 1.5', () => {
    expect(coef(6)).toBeCloseTo(1.5, 6)
  })
  it('streak 11 → 2.0 (cap)', () => {
    expect(coef(11)).toBeCloseTo(2.0, 6)
  })
  it('streak 20 → capped at 2.0', () => {
    expect(coef(20)).toBeCloseTo(2.0, 6)
  })
  it('streak 0 → 1.0 (guard)', () => {
    expect(coef(0)).toBeCloseTo(1.0, 6)
  })
})

describe('dailyPoints', () => {
  it('0 correct, streak 1 → 30 (checkin bonus only)', () => {
    expect(dailyPoints(0, 1)).toBe(30)
  })
  it('10 correct, streak 1 → 80', () => {
    expect(dailyPoints(10, 1)).toBe(80)
  })
  it('10 correct, streak 11 → 160 (x2)', () => {
    expect(dailyPoints(10, 11)).toBe(160)
  })
  it('floors fractional results', () => {
    expect(dailyPoints(1, 6)).toBe(52) // (5+30)*1.5 = 52.5 → 52
  })
})
