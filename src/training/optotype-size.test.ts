import { describe, it, expect } from 'vitest'
import {
  TRAIN_DISTANCE_MM,
  optotypeHeightMm,
  optotypeHeightPx,
  strokeWidthPx,
} from './optotype-size'

describe('optotypeHeightMm', () => {
  it('uses 400mm default distance', () => {
    expect(TRAIN_DISTANCE_MM).toBe(400)
  })
  it('acuity 1.0 → ~0.582mm at 40cm (5 arcmin)', () => {
    expect(optotypeHeightMm(1.0)).toBeCloseTo(0.582, 2)
  })
  it('acuity 0.8 → ~0.727mm (larger optotype)', () => {
    expect(optotypeHeightMm(0.8)).toBeCloseTo(0.727, 2)
  })
  it('lower acuity value → bigger optotype', () => {
    expect(optotypeHeightMm(0.5)).toBeGreaterThan(optotypeHeightMm(1.0))
  })
  it('scales ~linearly with distance (small angle)', () => {
    expect(optotypeHeightMm(1.0, 800) / optotypeHeightMm(1.0, 400)).toBeCloseTo(2, 3)
  })
  it('throws on non-positive acuity', () => {
    expect(() => optotypeHeightMm(0)).toThrow()
    expect(() => optotypeHeightMm(-1)).toThrow()
  })
})

describe('optotypeHeightPx', () => {
  it('multiplies mm by pxPerMm', () => {
    expect(optotypeHeightPx(1.0, 10)).toBeCloseTo(optotypeHeightMm(1.0) * 10, 6)
  })
})

describe('strokeWidthPx', () => {
  it('is one fifth of the optotype height', () => {
    expect(strokeWidthPx(50)).toBe(10)
  })
})
