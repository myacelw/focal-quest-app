import { describe, it, expect } from 'vitest'
import { isValidAcuity } from './acuity'

describe('isValidAcuity', () => {
  it('0.1 / 1.0 / 2.0 合法', () => {
    expect(isValidAcuity(0.1)).toBe(true)
    expect(isValidAcuity(1.0)).toBe(true)
    expect(isValidAcuity(2.0)).toBe(true)
  })
  it('0 / 负数 / 超 2.0 / NaN 拒绝', () => {
    expect(isValidAcuity(0)).toBe(false)
    expect(isValidAcuity(-1)).toBe(false)
    expect(isValidAcuity(2.1)).toBe(false)
    expect(isValidAcuity(NaN)).toBe(false)
  })
})
