import { describe, it, expect } from 'vitest'
import { cssPxPerMm, mmToCssPx, CARD_WIDTH_MM } from './calibration-math'

describe('CARD_WIDTH_MM', () => {
  it('is the ID-1 card width 85.6mm', () => {
    expect(CARD_WIDTH_MM).toBe(85.6)
  })
})

describe('cssPxPerMm', () => {
  it('derives px-per-mm from a card-width measurement', () => {
    // 若与卡片等宽的横条是 856 CSS px，则 1mm = 10 CSS px
    expect(cssPxPerMm(856)).toBeCloseTo(10, 5)
  })
  it('throws on non-positive width', () => {
    expect(() => cssPxPerMm(0)).toThrow()
    expect(() => cssPxPerMm(-5)).toThrow()
  })
})

describe('mmToCssPx', () => {
  it('converts mm to css px with a given ratio', () => {
    expect(mmToCssPx(20, 10)).toBe(200) // 20mm @ 10px/mm = 200px
  })
})
