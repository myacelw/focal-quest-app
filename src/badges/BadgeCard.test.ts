import { describe, it, expect } from 'vitest'
import { spritePos } from './BadgeCard'
import { BADGES } from './badge-defs'

/**
 * spritePos 把第 N 枚勋章映射到 sheet1/sheet2 的 4×4 宫格坐标。
 * 易错点：sheet2 第 4 行前 2 格是 AI 多画的废格，最后两枚勋章要跳到第 14/15 格。
 */
describe('spritePos — 勋章在两张 4×4 宫格图的位置', () => {
  it('前 16 枚走 sheet1，按顺序铺满 4×4', () => {
    expect(spritePos(BADGES[0].id)).toEqual({ sheet: 1, row: 0, col: 0 })
    expect(spritePos(BADGES[5].id)).toEqual({ sheet: 1, row: 1, col: 1 })
    expect(spritePos(BADGES[15].id)).toEqual({ sheet: 1, row: 3, col: 3 })
  })

  it('第 17..28 枚走 sheet2 的前 12 格（行 0-2 顺序）', () => {
    expect(spritePos(BADGES[16].id)).toEqual({ sheet: 2, row: 0, col: 0 })
    expect(spritePos(BADGES[27].id)).toEqual({ sheet: 2, row: 2, col: 3 })
  })

  it('最后 2 枚跳过 sheet2 第 4 行前 2 个废格，落在第 14/15 格', () => {
    expect(spritePos(BADGES[28].id)).toEqual({ sheet: 2, row: 3, col: 2 })
    expect(spritePos(BADGES[29].id)).toEqual({ sheet: 2, row: 3, col: 3 })
  })
})
