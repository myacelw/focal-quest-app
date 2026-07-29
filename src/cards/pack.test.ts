import { describe, it, expect } from 'vitest'
import { PACK_COST, PACK_WEIGHTS, pickCard } from './pack'
import { cardSetById } from './card-defs'

/** mulberry32：确定性伪随机，让统计性断言不 flaky */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pony = cardSetById('pony')!
const deep = cardSetById('deep')!

describe('卡包', () => {
  it('单价 2000 分，权重闪卡最低', () => {
    expect(PACK_COST).toBe(2000)
    expect(PACK_WEIGHTS).toEqual({ common: 65, rare: 28, shiny: 7 })
  })

  it('只从该套未拥有的卡里抽', () => {
    const owned = pony.cards.slice(0, 31).map((c) => c.id)
    for (const r of [0, 0.3, 0.7, 0.99]) {
      expect(pickCard(owned, pony, r)?.id).toBe(pony.cards[31].id)
    }
  })

  it('该套集齐返回 null', () => {
    expect(pickCard(pony.cards.map((c) => c.id), pony, 0.5)).toBeNull()
  })

  it('跨套互不影响：拥有整套 pony 不妨碍抽 deep', () => {
    const got = pickCard(pony.cards.map((c) => c.id), deep, 0.5)
    expect(got?.setId).toBe('deep')
  })

  it('闪卡在抽取顺序上系统性偏后 —— 集齐路上后段更有惊喜', () => {
    // 这条对冲"一套要练两个月、中途会腻"的风险，是 spec §4.4 唯一可验证的形式。
    // ⚠️ 不要写成"最后 4 张必是闪卡"：权重归一化只保证前两档抽空后剩闪卡，
    //    闪卡本身也可能被早早抽到。
    let commonPosSum = 0, commonN = 0, shinyPosSum = 0, shinyN = 0
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = prng(seed)
      const owned: string[] = []
      for (let pos = 1; pos <= pony.cards.length; pos++) {
        const c = pickCard(owned, pony, rnd())!
        owned.push(c.id)
        if (c.rarity === 'common') { commonPosSum += pos; commonN++ }
        if (c.rarity === 'shiny') { shinyPosSum += pos; shinyN++ }
      }
    }
    const commonAvg = commonPosSum / commonN
    const shinyAvg = shinyPosSum / shinyN
    // 固定种子 1..200 下实测：commonAvg=14.35、shinyAvg=22.64、差值 8.28（完全可复现）。
    // 锚在 7 而不是贴着 8.28：留一点余量，但也别松到 +2 那种"什么都拦不住"的程度——
    // 权重若被抹平成三档相同，差值会掉到 0 附近，这条就该红。
    expect(shinyAvg).toBeGreaterThan(commonAvg + 7)
  })

  it('抽满一整套不会重复，且第 33 次返回 null', () => {
    const rnd = prng(42)
    const owned: string[] = []
    for (let i = 0; i < pony.cards.length; i++) {
      const c = pickCard(owned, pony, rnd())
      expect(c).not.toBeNull()
      expect(owned).not.toContain(c!.id)
      owned.push(c!.id)
    }
    expect(pickCard(owned, pony, rnd())).toBeNull()
  })
})
