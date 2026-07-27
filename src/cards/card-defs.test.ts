import { describe, it, expect } from 'vitest'
import {
  CARD_SETS, PER_SET, TOTAL_CARDS, cardSetById, getCardDef, cardSheetPos, type CardRarity,
} from './card-defs'

describe('卡套数据', () => {
  it('两套，每套 32 张', () => {
    expect(CARD_SETS.map((s) => s.id)).toEqual(['pony', 'deep'])
    expect(PER_SET).toBe(32)
    expect(TOTAL_CARDS).toBe(64)
    for (const s of CARD_SETS) expect(s.cards.length).toBe(32)
  })

  it('卡 id 全局唯一', () => {
    const ids = CARD_SETS.flatMap((s) => s.cards.map((c) => c.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('卡 id 不含冒号 —— 同步 uuid 反解靠"自然键侧不含冒号"（sync-keys.naturalKeyFromUuid）', () => {
    for (const s of CARD_SETS) {
      for (const c of s.cards) expect(c.id.includes(':'), c.id).toBe(false)
    }
  })

  it('每套稀有度分配 = 普通 18 / 稀有 10 / 闪卡 4', () => {
    for (const s of CARD_SETS) {
      const n: Record<CardRarity, number> = { common: 0, rare: 0, shiny: 0 }
      for (const c of s.cards) n[c.rarity]++
      expect(n).toEqual({ common: 18, rare: 10, shiny: 4 })
    }
  })

  it('闪卡恰好是每套最后 4 张，即 sheet2 的最后一行 —— 出图时那 4 格要画得最华丽', () => {
    for (const s of CARD_SETS) {
      const shiny = s.cards.filter((c) => c.rarity === 'shiny')
      expect(shiny.map((c) => c.id)).toEqual([29, 30, 31, 32].map((n) => `${s.id}-${n}`))
      expect(shiny.map((c) => c.sheet)).toEqual([2, 2, 2, 2])
      expect(shiny.map((c) => c.index)).toEqual([12, 13, 14, 15])
    }
  })

  it('(sheet, index) 恰好覆盖两张 4×4 宫格的 0..15，无重无漏', () => {
    for (const s of CARD_SETS) {
      for (const sheet of [1, 2] as const) {
        const idx = s.cards.filter((c) => c.sheet === sheet).map((c) => c.index).sort((a, b) => a - b)
        expect(idx).toEqual([...Array(16).keys()])
      }
    }
  })

  it('cardSheetPos 用 4×4 行列（与 BadgeCard.spritePos 同一套约定）', () => {
    const set = cardSetById('pony')!
    expect(cardSheetPos(set.cards[0])).toEqual({ row: 0, col: 0 })   // 第 1 张 → sheet1 index 0
    expect(cardSheetPos(set.cards[5])).toEqual({ row: 1, col: 1 })   // 第 6 张 → sheet1 index 5
    expect(cardSheetPos(set.cards[31])).toEqual({ row: 3, col: 3 })  // 第 32 张 → sheet2 index 15
  })

  it('nameKey 形如 card.<setId>.<nn>（补零），套名形如 card.set.<setId>', () => {
    const set = cardSetById('deep')!
    expect(set.nameKey).toBe('card.set.deep')
    expect(set.cards[6].nameKey).toBe('card.deep.07')
  })

  it('按 id 查得到 def，未知 id 得 undefined', () => {
    expect(getCardDef('pony-7')?.setId).toBe('pony')
    expect(getCardDef('nope-99')).toBeUndefined()
    expect(cardSetById('nope')).toBeUndefined()
  })
})
