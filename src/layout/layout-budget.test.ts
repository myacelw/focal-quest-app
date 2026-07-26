import { describe, it, expect } from 'vitest'
import {
  PHONE_MAX_W_PX, SHORT_MAX_H_PX, NAV_ONE_LINE_MIN_PX, CANVAS_MAX_PX,
  DPAD_MAX_PX_PHONE, DPAD_MAX_PX_WIDE, MIN_STAGE_PX, TRAIN_WARN_MAX_H_PX,
  layoutMode, navHeightPx, dpadSidePx, answerBandPx, stageHeightPx, stageSidePx, everythingFits,
} from './layout-budget'

/** 真机视口表（CSS px）：手机竖屏是本迭代目标，iPad 两向是不许回退的基线 */
const DEVICES: { name: string; w: number; h: number }[] = [
  { name: 'iPhone SE1 竖', w: 320, h: 568 },
  { name: 'iPhone SE2 竖', w: 375, h: 667 },
  { name: 'iPhone X/13mini 竖', w: 375, h: 812 },
  { name: 'iPhone 12/13/14 竖', w: 390, h: 844 },
  { name: 'iPhone 11/XR 竖', w: 414, h: 896 },
  { name: 'iPhone 14 Pro Max 竖', w: 430, h: 932 },
  { name: 'iPad 竖', w: 768, h: 1024 },
  { name: 'iPad 横', w: 1024, h: 768 },
  { name: 'iPhone 横（非目标形态，仅要求不破版）', w: 812, h: 375 },
]

describe('layout-budget 布局预算', () => {
  it('手机断点不小于英文导航单行所需宽度（否则文字导航会折行、57px 假设再被打破）', () => {
    expect(PHONE_MAX_W_PX).toBeGreaterThanOrEqual(NAV_ONE_LINE_MIN_PX)
  })

  it('layoutMode：宽屏 wide、手机竖屏 phone、矮屏 short（矮屏优先，与 CSS 里 max-height 规则后置一致）', () => {
    expect(layoutMode(1024, 768)).toBe('wide')
    expect(layoutMode(768, 1024)).toBe('wide')
    expect(layoutMode(375, 812)).toBe('phone')
    expect(layoutMode(812, 375)).toBe('short')
    expect(layoutMode(400, SHORT_MAX_H_PX)).toBe('short')
  })

  it('navHeightPx：窄屏图标导航 60px、宽屏文字导航 57px', () => {
    expect(navHeightPx(375)).toBe(60)
    expect(navHeightPx(PHONE_MAX_W_PX)).toBe(60)
    expect(navHeightPx(PHONE_MAX_W_PX + 1)).toBe(57)
    expect(navHeightPx(1024)).toBe(57)
  })

  it('dpadSidePx：iPad 横竖屏都保持今天的 210px（不许因适配缩小）', () => {
    expect(dpadSidePx(1024, 768)).toBe(DPAD_MAX_PX_WIDE)
    expect(dpadSidePx(768, 1024)).toBe(DPAD_MAX_PX_WIDE)
  })

  it('dpadSidePx：手机竖屏放大到 240px 上限（拇指可达）', () => {
    expect(dpadSidePx(390, 844)).toBe(DPAD_MAX_PX_PHONE)
    expect(dpadSidePx(375, 812)).toBe(DPAD_MAX_PX_PHONE)
  })

  it('dpadSidePx：矮屏按高度收缩，不再吃满 210px', () => {
    expect(dpadSidePx(812, 375)).toBeCloseTo(127.5, 1)
    expect(dpadSidePx(375, 667)).toBeCloseTo(200.1, 1)
  })

  it('stageSidePx：iPad 横竖屏都等于画布上限 420（与今天的 maxWidth:420 一致）', () => {
    expect(stageSidePx(1024, 768)).toBe(CANVAS_MAX_PX)
    expect(stageSidePx(768, 1024)).toBe(CANVAS_MAX_PX)
  })

  it('stageSidePx 永不超过画布上限，且永不为负', () => {
    for (const d of DEVICES) {
      expect(stageSidePx(d.w, d.h)).toBeLessThanOrEqual(CANVAS_MAX_PX)
      expect(stageSidePx(d.w, d.h)).toBeGreaterThan(0)
    }
  })

  it('真机表全部放得下：舞台边长不小于 MIN_STAGE_PX，三段之和不超视口高', () => {
    for (const d of DEVICES) {
      expect(everythingFits(d.w, d.h), `${d.name} 放不下`).toBe(true)
      expect(stageSidePx(d.w, d.h)).toBeGreaterThanOrEqual(MIN_STAGE_PX)
      const total = navHeightPx(d.w) + 45 + stageHeightPx(d.w, d.h) + answerBandPx(d.w, d.h)
      expect(total).toBeLessThanOrEqual(d.h)
    }
  })

  it('提示阈值是保守的：在 TRAIN_WARN_MAX_H_PX 高度上其实还放得下（先提示再破版）', () => {
    for (const w of [320, 375, 812]) {
      expect(everythingFits(w, TRAIN_WARN_MAX_H_PX), `w=${w}`).toBe(true)
    }
  })

  it('提示阈值不是白设的：再矮 30px 就真放不下了', () => {
    for (const w of [320, 375, 812]) {
      expect(everythingFits(w, TRAIN_WARN_MAX_H_PX - 30), `w=${w}`).toBe(false)
    }
  })

  it('stageSidePx 对视口高单调不减（屏越高舞台不该变小）', () => {
    let prev = 0
    for (const h of [400, 500, 600, 700, 800, 900, 1000]) {
      const cur = stageSidePx(375, h)
      expect(cur).toBeGreaterThanOrEqual(prev)
      prev = cur
    }
  })
})
