import { describe, it, expect } from 'vitest'
import { BADGES } from './badge-defs'

describe('BADGES', () => {
  it('has 30 badges', () => {
    expect(BADGES).toHaveLength(30)
  })
  it('all ids are unique', () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(30)
  })
  it('every threshold is positive', () => {
    expect(BADGES.every((b) => b.threshold > 0)).toBe(true)
  })
  it('exactly 5 rainbow badges', () => {
    expect(BADGES.filter((b) => b.rarity === 'rainbow')).toHaveLength(5)
  })
})
