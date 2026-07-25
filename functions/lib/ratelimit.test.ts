import { describe, it, expect } from 'vitest'
import { overLimit, windowKey } from './ratelimit'

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
