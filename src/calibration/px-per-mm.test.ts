import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { sanitizePxPerMm, readPxPerMm, PX_PER_MM_MIN, PX_PER_MM_MAX } from './px-per-mm'
import { MIN_CARD_PX, CARD_SHORT_MM } from './calibration-fit'
import { CARD_WIDTH_MM } from './calibration-math'

describe('sanitizePxPerMm', () => {
  it('脏值一律 null —— 不编默认值，因为编出来的乘数会静默产出错误的视标物理尺寸', () => {
    expect(sanitizePxPerMm(Number('abc'))).toBe(null)   // NaN
    expect(sanitizePxPerMm(null)).toBe(null)
    expect(sanitizePxPerMm(0)).toBe(null)
    expect(sanitizePxPerMm(-5)).toBe(null)
    expect(sanitizePxPerMm(Infinity)).toBe(null)
  })

  it('越界也归 null（挡住 1e6 这类脏值）', () => {
    expect(sanitizePxPerMm(PX_PER_MM_MAX + 0.1)).toBe(null)
    expect(sanitizePxPerMm(PX_PER_MM_MIN - 0.1)).toBe(null)
    expect(sanitizePxPerMm(1e6)).toBe(null)
  })

  it('真实屏幕标定得出的值必须全部通过', () => {
    // 常见 CSS 像素密度：96dpi ≈ 3.78、iPad ≈ 5.2、手机竖屏按卡片短边 ≈ 6.4
    for (const v of [3.78, 5.2, 6.39, 20.5]) expect(sanitizePxPerMm(v)).toBe(v)
  })

  it('下界比标定 UI 能产出的最小值更宽松 —— 永不误杀用户真标定出来的值', () => {
    // 标定 UI 的最小卡片宽度是 MIN_CARD_PX，长边模式给出最小的 px/mm
    const smallestPossible = MIN_CARD_PX / CARD_WIDTH_MM
    expect(smallestPossible).toBeGreaterThan(PX_PER_MM_MIN)
    expect(sanitizePxPerMm(smallestPossible)).toBe(smallestPossible)
    expect(sanitizePxPerMm(MIN_CARD_PX / CARD_SHORT_MM)).not.toBe(null)
  })
})

describe('readPxPerMm', () => {
  // vitest 跑在 node 环境、没有 localStorage（`lsGet` 靠 try/catch 兜住，所以生产代码不受影响）。
  // 这里挂一个最小内存桩，好让"读到脏值会怎样"这条路径能被真的走一遍——只测纯函数
  // 就恰好漏掉了本次要堵的洞（洞在 `v ? Number(v) : null` 这个读取写法本身）。
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }
  })
  afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage })

  it('没标定过 → null', () => {
    expect(readPxPerMm()).toBe(null)
  })

  it("'abc' → null 而不是 NaN —— 这正是本次要堵的洞", () => {
    // 修之前：`v ? Number(v) : null` 返回 NaN，而 NaN !== null，
    // 于是三个页面的「请先标定」分支都进不去，heightPx = mm × NaN，视标渲染不出来。
    localStorage.setItem('fzp.cssPxPerMm', 'abc')
    expect(readPxPerMm()).toBe(null)
    expect(Number.isNaN(readPxPerMm() as number)).toBe(false)
  })

  it("'0' 与空串 → null", () => {
    localStorage.setItem('fzp.cssPxPerMm', '0')
    expect(readPxPerMm()).toBe(null)
    localStorage.setItem('fzp.cssPxPerMm', '')
    expect(readPxPerMm()).toBe(null)
  })

  it('正常值原样返回', () => {
    localStorage.setItem('fzp.cssPxPerMm', '5.2')
    expect(readPxPerMm()).toBe(5.2)
  })
})
