import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import type { BadgeStats } from './stats-derive'

const ZERO: BadgeStats = { maxStreak: 0, totalSessions: 0, totalSec: 0, maxCpm: 0, maxAccuracy: 0, totalCorrect: 0 }

describe('evaluate', () => {
  it('zero stats → nothing achieved', () => {
    expect(evaluate(ZERO)).toEqual([])
  })
  it('1 session unlocks sessions-1 only (among sessions)', () => {
    const out = evaluate({ ...ZERO, totalSessions: 1 })
    expect(out).toContain('sessions-1')
    expect(out).not.toContain('sessions-5')
  })
  it('threshold is inclusive (>=)', () => {
    expect(evaluate({ ...ZERO, maxStreak: 7 })).toContain('streak-7')
  })
  it('maxCpm 12 unlocks cpm-6/8/10/12 but not cpm-15', () => {
    const out = evaluate({ ...ZERO, maxCpm: 12 })
    expect(out).toEqual(expect.arrayContaining(['cpm-6', 'cpm-8', 'cpm-10', 'cpm-12']))
    expect(out).not.toContain('cpm-15')
  })
  it('perfect accuracy unlocks acc-90 and acc-100', () => {
    const out = evaluate({ ...ZERO, maxAccuracy: 1.0 })
    expect(out).toEqual(expect.arrayContaining(['acc-90', 'acc-100']))
  })
})
