import { describe, it, expect } from 'vitest'
import { challengeUnlocked } from './challenge-unlock'

describe('challengeUnlocked', () => {
  it('今天已完成训练打卡 → 解锁', () => {
    expect(challengeUnlocked({ checkedInToday: true })).toBe(true)
  })

  it('今天还没练 → 不解锁（挑战是训练的奖赏，不是替代品）', () => {
    expect(challengeUnlocked({ checkedInToday: false })).toBe(false)
  })

  it('stats 还在加载（null）→ 不解锁，入口不闪现', () => {
    expect(challengeUnlocked(null)).toBe(false)
  })

  it('undefined / 缺字段 → 不解锁；getHomeStats 在 IndexedDB 不可用时也降级为 false（安全方向）', () => {
    expect(challengeUnlocked(undefined)).toBe(false)
    expect(challengeUnlocked({} as { checkedInToday: boolean })).toBe(false)
  })
})
