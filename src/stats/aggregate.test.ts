import { describe, it, expect } from 'vitest'
import { aggregate } from './aggregate'
import type { SessionRow } from '../data/db'

function mk(over: Partial<SessionRow>): SessionRow {
  return {
    date: '2026-07-07', startedAtMs: 0, eye: 'left',
    answered: 10, correct: 8, flips: 20, elapsedSec: 120, acuity: 0.8,
    ...over,
  }
}

describe('aggregate', () => {
  it('empty → []', () => {
    expect(aggregate([], 'day')).toEqual([])
  })

  it('groups same day into one period, counts sessions', () => {
    const out = aggregate([mk({}), mk({ eye: 'right' })], 'day')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ label: '2026-07-07', count: 2, totalSec: 240 })
  })

  it('avgCpm = cpm(sumFlips, sumSec); avgAccuracy = sumCorrect/sumAnswered', () => {
    const out = aggregate([mk({ flips: 20, elapsedSec: 60, correct: 8, answered: 10 })], 'day')
    // cpm(20,60) = 20/2/(60/60) = 10
    expect(out[0].avgCpm).toBeCloseTo(10, 6)
    expect(out[0].avgAccuracy).toBeCloseTo(0.8, 6)
  })

  it('sorts periods ascending by label', () => {
    const out = aggregate([mk({ date: '2026-07-08' }), mk({ date: '2026-07-06' })], 'day')
    expect(out.map((s) => s.label)).toEqual(['2026-07-06', '2026-07-08'])
  })

  it('answered 0 → accuracy 0 (guard)', () => {
    const out = aggregate([mk({ answered: 0, correct: 0 })], 'day')
    expect(out[0].avgAccuracy).toBe(0)
  })

  it('groups by month', () => {
    const out = aggregate(
      [mk({ date: '2026-07-06' }), mk({ date: '2026-07-20' }), mk({ date: '2026-08-01' })],
      'month',
    )
    expect(out.map((s) => s.label)).toEqual(['2026-07', '2026-08'])
    expect(out[0].count).toBe(2)
  })

  it('groups by week (Monday start)', () => {
    const out = aggregate(
      [mk({ date: '2024-01-03' }), mk({ date: '2024-01-07' }), mk({ date: '2024-01-08' })],
      'week',
    )
    expect(out.map((s) => s.label)).toEqual(['2024-01-01', '2024-01-08'])
    expect(out[0].count).toBe(2)
  })
})
