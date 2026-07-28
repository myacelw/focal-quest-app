import { describe, it, expect } from 'vitest'
import { buildSpiritPool, spiritForSeq } from './ForestStage'

describe('spiritForSeq — 精灵每题轮换', () => {
  it('第 0 题是 sprout（基础池首位）', () => {
    expect(spiritForSeq(0).name).toBe('sprout')
  })

  it('逐题轮换到不同精灵', () => {
    expect(spiritForSeq(1).name).not.toBe(spiritForSeq(0).name)
  })

  it('转满一圈（基础池长 6）回到起点', () => {
    expect(spiritForSeq(6).name).toBe(spiritForSeq(0).name)
  })

  it('负数 / 异常 seq 兜底不越界', () => {
    expect(spiritForSeq(-1).name).toBeTruthy()
    expect(spiritForSeq(-7).name).toBeTruthy()
  })
})

describe('皮肤池联动 — 已捕获的储备精灵加入轮换', () => {
  it('无捕获时只有基础 6 只', () => {
    expect(buildSpiritPool().length).toBe(6)
    expect(buildSpiritPool([]).length).toBe(6)
  })

  it('未捕获对应 id 时，传入的无关 id 不生效', () => {
    expect(buildSpiritPool(['space-ufo', 'shrine-golem']).length).toBe(6)
  })

  it('捕获 forest-elder_tree 后池长 7，第 6 题变成它', () => {
    const pool = buildSpiritPool(['forest-elder_tree'])
    expect(pool.length).toBe(7)
    expect(spiritForSeq(6, ['forest-elder_tree']).name).toBe('elder_tree')
  })

  it('捕获多只后顺序 = 基础 + 已捕获储备（储备按 id 排序）', () => {
    const pool = buildSpiritPool(['forest-moon_deer', 'forest-elder_tree'])
    expect(pool.length).toBe(8)
    // reserveMonstersOfWorld 按 id.localeCompare 排序：elder_tree < moon_deer
    expect(pool.slice(6).map((s) => s.name)).toEqual(['elder_tree', 'moon_deer'])
  })

  it('储备精灵都是 img 类型（森林没有 sprite 素材）', () => {
    for (const s of buildSpiritPool(['forest-elder_tree'])) expect(s.kind).toBe('img')
  })
})
