import { describe, it, expect } from 'vitest'
import { pickWeighted } from './pick-weighted'

type Tier = 'a' | 'b'
const ORDER: readonly Tier[] = ['a', 'b']
const W: Record<Tier, number> = { a: 80, b: 20 }

interface Item { id: string; tier: Tier }
const tierOf = (i: Item) => i.tier

describe('pickWeighted', () => {
  it('空池返回 null', () => {
    expect(pickWeighted<Item, Tier>([], tierOf, W, ORDER, 0.5)).toBeNull()
  })

  it('rand 落在哪一档的权重区段就抽哪一档', () => {
    const pool: Item[] = [{ id: 'a1', tier: 'a' }, { id: 'b1', tier: 'b' }]
    // total=100，rand=0.5 → target=50 < 80 → 档 a
    expect(pickWeighted(pool, tierOf, W, ORDER, 0.5)?.id).toBe('a1')
    // rand=0.9 → target=90 ≥ 80 → 档 b
    expect(pickWeighted(pool, tierOf, W, ORDER, 0.9)?.id).toBe('b1')
  })

  it('某档池空时权重归一化到剩余档（不会白占概率而返回 null）', () => {
    const onlyB: Item[] = [{ id: 'b1', tier: 'b' }]
    // 档 a 为空 → total 只剩 20，任何 rand 都必须抽到 b
    for (const r of [0, 0.1, 0.5, 0.99]) {
      expect(pickWeighted(onlyB, tierOf, W, ORDER, r)?.id).toBe('b1')
    }
  })

  it('池内位置不偏置 —— 用区段余量算第二个分数，不复用 rand 本身', () => {
    // 这是 capture.ts 里修过的那个 bug 的回归锚：直接拿 rand 映射下标的话，
    // 低权重档（rand 只可能落在区段尾部）永远只抽到池尾那一个。
    const pool: Item[] = [
      { id: 'a1', tier: 'a' }, { id: 'a2', tier: 'a' },
      { id: 'b1', tier: 'b' }, { id: 'b2', tier: 'b' },
    ]
    // 档 b 的权重区段是 [80,100)：区段内前半 → b1，后半 → b2
    expect(pickWeighted(pool, tierOf, W, ORDER, 0.85)?.id).toBe('b1')
    expect(pickWeighted(pool, tierOf, W, ORDER, 0.95)?.id).toBe('b2')
  })
})
