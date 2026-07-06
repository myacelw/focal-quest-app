import { describe, it, expect } from 'vitest'
import { cpm } from './cpm'

describe('cpm', () => {
  it('24 flips in 60s = 12 cpm (1 cycle = 2 flips)', () => {
    expect(cpm(24, 60)).toBeCloseTo(12, 6)
  })
  it('12 flips in 30s = 12 cpm', () => {
    expect(cpm(12, 30)).toBeCloseTo(12, 6)
  })
  it('0 flips = 0', () => {
    expect(cpm(0, 60)).toBe(0)
  })
  it('guards divide-by-zero', () => {
    expect(cpm(10, 0)).toBe(0)
  })
})
