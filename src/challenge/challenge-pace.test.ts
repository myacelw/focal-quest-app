import { describe, it, expect } from 'vitest'
import {
  medianMs, derivePace, windowMsForIndex, challengeFlipMs, DEFAULT_PACE,
  CHALLENGE_DURATION_MS, PACE_SAMPLE_N, MIN_SAMPLES, DEFAULT_BASELINE_MS,
  INITIAL_FACTOR, FASTEST_FACTOR, FASTEST_FACTOR_FLOOR, STEP_EVERY, TIERS,
  INITIAL_MIN_MS, FASTEST_MIN_MS, BASELINE_MAX_MS, MIN_FLIP_MS,
} from './challenge-pace'

describe('medianMs', () => {
  it('奇数个取中间那个', () => {
    expect(medianMs([900, 1000, 5000])).toBe(1000)
  })

  it('偶数个取中间两个的平均', () => {
    expect(medianMs([800, 900, 1100, 1200])).toBe(1000)
  })

  it('过滤 0 与非法值（写库时没有反应数据会落 0，不是 undefined）', () => {
    expect(medianMs([0, 0, 1000, Number.NaN, 1000])).toBe(1000)
  })

  it('没有有效值返回 null', () => {
    expect(medianMs([])).toBeNull()
    expect(medianMs([0, 0, 0])).toBeNull()
  })
})

describe('derivePace', () => {
  it('有效样本少于 3 个 → 固定默认 2000/1300（spec §4.4）', () => {
    const p = derivePace([1000, 0, 1000])
    expect(p).toMatchObject({ adaptive: false, baselineMs: DEFAULT_BASELINE_MS, initialMs: 2000, fastestMs: 1300 })
    expect(p.stepMs).toBe(175)
    expect(MIN_SAMPLES).toBe(3)
  })

  it('基准 1000ms → 初始 2000 / 最快 1300 / 每档 175（spec §4.3 的算例）', () => {
    const p = derivePace([1000, 1000, 1000, 1000])
    expect(p).toMatchObject({ adaptive: true, baselineMs: 1000, initialMs: 2000, fastestMs: 1300, stepMs: 175 })
    expect(INITIAL_FACTOR).toBe(2.0)
    expect(STEP_EVERY).toBe(3)
    expect(TIERS).toBe(4)
  })

  it('只看最近 PACE_SAMPLE_N 个（调用方传新→旧），第 21 个极值不影响基准', () => {
    const twenty = Array.from({ length: PACE_SAMPLE_N }, () => 1000)
    expect(derivePace([...twenty, 9000]).baselineMs).toBe(1000)
  })

  it('基准过小：钳的是基准（下限 750 = INITIAL_MIN_MS / INITIAL_FACTOR），窗口仍按系数派生 → 1500 / 1000', () => {
    const p = derivePace([200, 200, 200, 200])
    expect(p.baselineMs).toBe(INITIAL_MIN_MS / INITIAL_FACTOR)
    expect(p.initialMs).toBe(INITIAL_MIN_MS)
    expect(p.fastestMs).toBe(FASTEST_MIN_MS) // 750×1.3=975 被 FASTEST_MIN_MS 抬到 1000（抬高=安全方向）
  })

  it('基准过大：只钳基准到 BASELINE_MAX_MS=3000（真孩子最慢也就 2-3 秒，再大即脏数据），两窗仍按系数派生', () => {
    const p = derivePace([5000, 5000, 5000, 5000])
    expect(p.baselineMs).toBe(BASELINE_MAX_MS)
    expect(p.initialMs).toBe(6000) // 3000 × 2.0
    expect(p.fastestMs).toBe(3900) // 3000 × 1.3 —— 系数没有被任何窗口上限压过
  })

  it('医学边界①：任何基准下最快窗口都不低于 基准×1.3（低端只会被抬高，高端只钳基准本身）', () => {
    for (const b of [150, 400, 700, 1000, 1234, 1800, 2400, 4000, 8000]) {
      const p = derivePace([b, b, b, b])
      expect(p.fastestMs, `基准 ${b}`).toBeGreaterThanOrEqual(
        Math.round(Math.min(b, BASELINE_MAX_MS) * FASTEST_FACTOR_FLOOR),
      )
      expect(p.fastestMs).toBeLessThanOrEqual(p.initialMs)
    }
  })

  it('回归锚：基准 2500ms 的最快窗口必须 ≥3250ms（旧版 FASTEST_MAX_MS=2500 会把它压成 2500=×1.0，约一半的题必超时）', () => {
    expect(derivePace([2500, 2500, 2500, 2500]).fastestMs).toBeGreaterThanOrEqual(3250)
    // 顺带锁住"钳制不得再爬回窗口上"：两窗恒等于 基准×系数（低端抬高除外）
    const p = derivePace([2000, 2000, 2000, 2000])
    expect(p.initialMs).toBe(Math.round(p.baselineMs * INITIAL_FACTOR))
    expect(p.fastestMs).toBe(Math.round(p.baselineMs * FASTEST_FACTOR))
  })

  it('DEFAULT_PACE 就是数据不足时那一档，且总时长是 30 秒', () => {
    expect(DEFAULT_PACE).toMatchObject({ adaptive: false, initialMs: 2000, fastestMs: 1300 })
    expect(CHALLENGE_DURATION_MS).toBe(30_000)
  })
})

describe('windowMsForIndex', () => {
  it('每 3 题降一档、四档到底（基准 1000ms 的完整序列）', () => {
    const p = derivePace([1000, 1000, 1000, 1000])
    const seq = Array.from({ length: 15 }, (_, i) => windowMsForIndex(p, i))
    expect(seq).toEqual([
      2000, 2000, 2000,
      1825, 1825, 1825,
      1650, 1650, 1650,
      1475, 1475, 1475,
      1300, 1300, 1300,
    ])
  })

  it('永远落在 [fastestMs, initialMs] 区间内（第 40 题也不会破底）', () => {
    for (const b of [300, 1000, 1700, 6000]) {
      const p = derivePace([b, b, b, b])
      for (let i = 0; i <= 40; i++) {
        const w = windowMsForIndex(p, i)
        expect(w, `基准 ${b} 第 ${i} 题`).toBeGreaterThanOrEqual(p.fastestMs)
        expect(w).toBeLessThanOrEqual(p.initialMs)
      }
    }
  })
})

describe('challengeFlipMs', () => {
  it('医学边界②：设置页三档（600/900/1500）恒等通过', () => {
    expect(challengeFlipMs(600)).toBe(600)
    expect(challengeFlipMs(900)).toBe(900)
    expect(challengeFlipMs(1500)).toBe(1500)
  })

  it('医学边界②：任何低于 600 的值（含手改 localStorage / 将来加更快档）都被抬到 600', () => {
    expect(MIN_FLIP_MS).toBe(600)
    for (const v of [0, 1, 120, 599]) expect(challengeFlipMs(v), `输入 ${v}`).toBe(MIN_FLIP_MS)
  })

  it('非法值兜底 600，不是 NaN', () => {
    expect(challengeFlipMs(Number.NaN)).toBe(MIN_FLIP_MS)
    expect(challengeFlipMs(null)).toBe(MIN_FLIP_MS)
    expect(challengeFlipMs(undefined)).toBe(MIN_FLIP_MS)
  })

  it('医学边界的两个系数常量本身也被锚定（有人调参时必须撞到红）', () => {
    expect(FASTEST_FACTOR).toBeGreaterThanOrEqual(1.3)
    expect(FASTEST_FACTOR_FLOOR).toBe(1.3)
    // 最快窗口必须真的比初始窗口短，否则"加速"会变成"减速"。
    // 这条替代了旧实现里 Math.min(..., initialMs) 那条安全带——安全带会把误配静默吞掉，
    // 而误配正该在测试里炸出来。
    expect(FASTEST_FACTOR).toBeLessThan(INITIAL_FACTOR)
  })
})
