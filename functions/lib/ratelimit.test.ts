import { describe, it, expect } from 'vitest'
import {
  overLimit,
  windowKey,
  HOUR_MS,
  DAY_MS,
  REGISTER_OK_PER_IP_MAX,
  REGISTER_FAIL_PER_IP_MAX,
} from './ratelimit'

describe('windowKey', () => {
  it('同一时间窗内的两个时刻得到同一个 key', () => {
    const hour = 3600_000
    expect(windowKey(1_000_000_000_000, hour)).toBe(windowKey(1_000_000_000_000 + 60_000, hour))
  })

  it('跨窗后 key 变化（旧计数自然失效）', () => {
    const hour = 3600_000
    expect(windowKey(1_000_000_000_000, hour)).not.toBe(windowKey(1_000_000_000_000 + hour, hour))
  })
})

describe('overLimit', () => {
  it('未达上限为 false', () => {
    expect(overLimit(0, 10)).toBe(false)
    expect(overLimit(9, 10)).toBe(false)
  })

  it('达到或超过上限为 true', () => {
    expect(overLimit(10, 10)).toBe(true)
    expect(overLimit(11, 10)).toBe(true)
  })
})

/*
 * 锚定注册限速的设计意图，别让后人"顺手合并成一个额度"。
 * 家长常手抄或口述邀请码，抄错是常态；若失败与成功共用日额度，抄错几次就被锁一整天。
 */
describe('注册限速的两道额度', () => {
  it('失败额度用短窗口（小时），抄错码最多等一小时就自愈', () => {
    expect(HOUR_MS).toBeLessThan(DAY_MS)
  })

  it('成功建号额度按日且明显宽于失败额度（家庭最多注册两三个，只挡脚本批量建号）', () => {
    expect(REGISTER_OK_PER_IP_MAX).toBeGreaterThan(REGISTER_FAIL_PER_IP_MAX)
    expect(REGISTER_OK_PER_IP_MAX).toBeGreaterThanOrEqual(20)
  })

  it('失败额度足够容忍正常人的手抄错误（至少 5 次）', () => {
    expect(REGISTER_FAIL_PER_IP_MAX).toBeGreaterThanOrEqual(5)
  })
})
