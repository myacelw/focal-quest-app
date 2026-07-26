import { describe, it, expect } from 'vitest'
import { cssPxPerMm, CARD_WIDTH_MM } from './calibration-math'
import {
  CARD_SHORT_MM, HANDLE_RESERVE_PX, MIN_CARD_PX, LONG_EDGE_MIN_PX,
  maxCardPx, pickCardEdge, edgeMm, ratioFromCardPx, cardPxFromRatio, canSave,
} from './calibration-fit'

/** 真机常量：375 CSS px 的 iPhone 竖屏，物理屏宽约 62mm → 约 6.05 px/mm */
const PHONE_TRUE_RATIO = 6.05

describe('标定的窄屏适配', () => {
  it('maxCardPx 给右侧拖柄留出空间', () => {
    expect(maxCardPx(1024)).toBe(1024 - HANDLE_RESERVE_PX)
    expect(maxCardPx(375)).toBe(375 - HANDLE_RESERVE_PX)
  })

  it('maxCardPx 有下限，不会小于最小卡宽', () => {
    expect(maxCardPx(100)).toBe(MIN_CARD_PX + 10)
    expect(maxCardPx(0)).toBe(MIN_CARD_PX + 10)
  })

  it('pickCardEdge：iPad 竖屏 / 横屏都用长边', () => {
    expect(pickCardEdge(768)).toBe('long')
    expect(pickCardEdge(1024)).toBe('long')
  })

  it('pickCardEdge：手机竖屏放不下长边，改用短边', () => {
    expect(pickCardEdge(375)).toBe('short')
    expect(pickCardEdge(430)).toBe('short')
  })

  it('pickCardEdge：手机横屏又能用长边（标定值与方向无关，横屏标一次最准）', () => {
    expect(pickCardEdge(812)).toBe('long')
  })

  it('pickCardEdge 的分界就是 LONG_EDGE_MIN_PX', () => {
    expect(pickCardEdge(LONG_EDGE_MIN_PX + HANDLE_RESERVE_PX)).toBe('long')
    expect(pickCardEdge(LONG_EDGE_MIN_PX + HANDLE_RESERVE_PX - 1)).toBe('short')
  })

  it('edgeMm：长边 85.6、短边 53.98', () => {
    expect(edgeMm('long')).toBe(CARD_WIDTH_MM)
    expect(edgeMm('short')).toBe(CARD_SHORT_MM)
  })

  it('长边模式与既有 cssPxPerMm 完全等价（不改既有语义）', () => {
    expect(ratioFromCardPx(856, 'long')).toBeCloseTo(cssPxPerMm(856), 10)
    expect(ratioFromCardPx(518, 'long')).toBeCloseTo(cssPxPerMm(518), 10)
  })

  it('短边模式按 53.98mm 折算', () => {
    expect(ratioFromCardPx(539.8, 'short')).toBeCloseTo(10, 6)
  })

  it('非正卡宽抛错（和 cssPxPerMm 一致的防呆）', () => {
    expect(() => ratioFromCardPx(0, 'short')).toThrow()
    expect(() => ratioFromCardPx(-5, 'long')).toThrow()
  })

  it('cardPxFromRatio 与 ratioFromCardPx 互逆', () => {
    for (const edge of ['long', 'short'] as const) {
      const px = cardPxFromRatio(PHONE_TRUE_RATIO, edge)
      expect(ratioFromCardPx(px, edge)).toBeCloseTo(PHONE_TRUE_RATIO, 10)
    }
  })

  it('短边模式在 375 屏上够得到真机 6.05 px/mm（长边模式够不到，这就是换边的理由）', () => {
    expect(ratioFromCardPx(maxCardPx(375), 'short')).toBeGreaterThan(PHONE_TRUE_RATIO)
    expect(ratioFromCardPx(maxCardPx(375), 'long')).toBeLessThan(PHONE_TRUE_RATIO)
  })

  it('canSave：没有存档、屏幕够宽 → 允许保存', () => {
    expect(canSave(1024, 'long', null)).toBe(true)
    expect(canSave(375, 'short', null)).toBe(true)
  })

  it('canSave：已存 6.05 但当前屏够不到（长边模式 + 375 宽）→ 禁止保存，保护既有正确值', () => {
    expect(canSave(375, 'long', PHONE_TRUE_RATIO)).toBe(false)
    expect(canSave(375, 'short', PHONE_TRUE_RATIO)).toBe(true)
  })
})
