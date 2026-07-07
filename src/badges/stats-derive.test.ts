import { describe, it, expect } from 'vitest'
import { deriveStats } from './stats-derive'
import type { SessionRow, CheckinRow } from '../data/db'

function mk(over: Partial<SessionRow>): SessionRow {
  return { date: '2026-07-07', startedAtMs: 0, eye: 'left', answered: 10, correct: 8, flips: 20, elapsedSec: 120, acuity: 0.8, ...over }
}
function ck(over: Partial<CheckinRow>): CheckinRow {
  return { date: '2026-07-07', streak: 1, dailyPoints: 30, totalPoints: 30, ...over }
}

describe('deriveStats', () => {
  it('empty → all zero', () => {
    expect(deriveStats([], [])).toEqual({
      maxStreak: 0, totalSessions: 0, totalSec: 0, maxCpm: 0, maxAccuracy: 0, totalCorrect: 0,
    })
  })

  it('maxStreak is the max checkin streak', () => {
    expect(deriveStats([], [ck({ streak: 3 }), ck({ date: '2026-07-08', streak: 7 })]).maxStreak).toBe(7)
  })

  it('totals and maxCpm', () => {
    const out = deriveStats([mk({ flips: 20, elapsedSec: 60, correct: 8 }), mk({ flips: 10, elapsedSec: 120, correct: 5 })], [])
    expect(out.totalSessions).toBe(2)
    expect(out.totalSec).toBe(180)
    expect(out.totalCorrect).toBe(13)
    // cpm(20,60)=10 vs cpm(10,120)=2.5 → max 10
    expect(out.maxCpm).toBeCloseTo(10, 6)
  })

  it('maxAccuracy only counts sessions with answered>=5', () => {
    // a perfect 1/1 session must NOT count; the 8/10 one should
    const out = deriveStats([mk({ answered: 1, correct: 1 }), mk({ answered: 10, correct: 8 })], [])
    expect(out.maxAccuracy).toBeCloseTo(0.8, 6)
  })
})
