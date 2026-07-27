import { describe, it, expect } from 'vitest'
import {
  CARD_SETS, PER_SET, PER_SHEET, SHEET_GRID, SHEETS_PER_SET, TOTAL_CARDS,
  cardSetById, getCardDef, cardSheetPos, type CardRarity,
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

  it('网格是 2×2、每套 8 张宫格图', () => {
    expect(SHEET_GRID).toBe(2)
    expect(PER_SHEET).toBe(4)
    expect(SHEETS_PER_SET).toBe(8)
  })

  it('闪卡恰好是每套最后 4 张，且**独占最后一张宫格图** —— 那张的提示词可以纯写"全是传说级"', () => {
    for (const s of CARD_SETS) {
      const shiny = s.cards.filter((c) => c.rarity === 'shiny')
      expect(shiny.map((c) => c.id)).toEqual([29, 30, 31, 32].map((n) => `${s.id}-${n}`))
      expect(shiny.map((c) => c.sheet)).toEqual([8, 8, 8, 8])
      expect(shiny.map((c) => c.index)).toEqual([0, 1, 2, 3])
      // 反向：第 8 张图里没有别的档位混进来
      expect(s.cards.filter((c) => c.sheet === 8).every((c) => c.rarity === 'shiny')).toBe(true)
    }
  })

  it('(sheet, index) 恰好覆盖 8 张宫格图的 0..3，无重无漏', () => {
    for (const s of CARD_SETS) {
      for (let sheet = 1; sheet <= SHEETS_PER_SET; sheet++) {
        const idx = s.cards.filter((c) => c.sheet === sheet).map((c) => c.index).sort((a, b) => a - b)
        expect(idx, `${s.id} sheet${sheet}`).toEqual([...Array(PER_SHEET).keys()])
      }
    }
  })

  it('cardSheetPos 按 SHEET_GRID 行优先展开', () => {
    const set = cardSetById('pony')!
    expect(cardSheetPos(set.cards[0])).toEqual({ row: 0, col: 0 })   // 第 1 张 → sheet1 index 0
    expect(cardSheetPos(set.cards[5])).toEqual({ row: 0, col: 1 })   // 第 6 张 → sheet2 index 1
    expect(cardSheetPos(set.cards[31])).toEqual({ row: 1, col: 1 })  // 第 32 张 → sheet8 index 3
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
