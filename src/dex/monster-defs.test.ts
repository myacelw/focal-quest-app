import { describe, it, expect } from 'vitest'
import {
  MONSTER_DEFS, TOTAL_MONSTERS, monstersOfWorld, reserveMonstersOfWorld, getMonsterDef,
  WORLDS, emptyByWorld, isWorld,
  type World, type Rarity,
} from './monster-defs'
// 直接引用皮肤池里的 name slug，验证现役 18 只 id 与之对齐
import { enemyForSeq } from '../skins/space/SpaceStage'
import { guardianForSeq } from '../skins/shrine/ShrineStage'
import { spiritForSeq } from '../skins/forest/ForestStage'

describe('MONSTER_DEFS', () => {
  it('共 82 只（space/shrine 各 33 = 6 普 + 18 稀 + 9 史，forest 16）', () => {
    expect(TOTAL_MONSTERS).toBe(82)
    expect(MONSTER_DEFS).toHaveLength(82)
  })

  it('id 唯一', () => {
    expect(new Set(MONSTER_DEFS.map((m) => m.id)).size).toBe(82)
  })

  it('space/shrine 各 33 只且稀有度结构正确', () => {
    for (const w of ['space', 'shrine'] as World[]) {
      const list = monstersOfWorld(w)
      expect(list).toHaveLength(33)
      expect(list.filter((m) => m.rarity === 'common')).toHaveLength(6)
      expect(list.filter((m) => m.rarity === 'rare')).toHaveLength(18)
      expect(list.filter((m) => m.rarity === 'epic')).toHaveLength(9)
    }
  })

  it('monstersOfWorld 按稀有度（史诗优先）排序', () => {
    const order: Record<Rarity, number> = { epic: 0, rare: 1, common: 2 }
    for (const w of ['space', 'shrine'] as World[]) {
      const list = monstersOfWorld(w)
      for (let i = 1; i < list.length; i++) {
        expect(order[list[i - 1].rarity]).toBeLessThanOrEqual(order[list[i].rarity])
      }
    }
  })

  it('reserveMonstersOfWorld 排除现役（rarity !== common）每世界 27 只', () => {
    expect(reserveMonstersOfWorld('space')).toHaveLength(27)
    expect(reserveMonstersOfWorld('shrine')).toHaveLength(27)
  })

  it('现役 18 只 id 与皮肤池 slug 对齐（space-enemy / shrine-skeleton / forest-sprout 等）', () => {
    // SpaceStage 的 enemy.name slug 应都在 MONSTER_DEFS 里以 space- 前缀存在
    const spaceNames: string[] = []
    for (let i = 0; i < 6; i++) spaceNames.push(enemyForSeq(i).name)
    for (const slug of spaceNames) {
      expect(getMonsterDef(`space-${slug}`)).toBeDefined()
    }
    const shrineNames: string[] = []
    for (let i = 0; i < 6; i++) shrineNames.push(guardianForSeq(i).name)
    for (const slug of shrineNames) {
      expect(getMonsterDef(`shrine-${slug}`)).toBeDefined()
    }
    // ForestStage 的 spirit.name slug 应都在 MONSTER_DEFS 里以 forest- 前缀存在
    const forestNames: string[] = []
    for (let i = 0; i < 6; i++) forestNames.push(spiritForSeq(i).name)
    for (const slug of forestNames) {
      expect(getMonsterDef(`forest-${slug}`)).toBeDefined()
    }
  })

  it('所有 monster 的 nameKey 都以 world 前缀开头', () => {
    const PREFIX: Record<World, string> = {
      space: 'space.enemy.',
      shrine: 'shrine.guardian.',
      forest: 'forest.spirit.',
    }
    for (const m of MONSTER_DEFS) {
      expect(m.nameKey.startsWith(PREFIX[m.world]), m.nameKey).toBe(true)
    }
  })
})

describe('扩池后的图鉴规模', () => {
  it('总数 82；分世界 33 / 33 / 16', () => {
    expect(TOTAL_MONSTERS).toBe(82)
    expect(monstersOfWorld('space').length).toBe(33)
    expect(monstersOfWorld('shrine').length).toBe(33)
    expect(monstersOfWorld('forest').length).toBe(16)
  })

  it('稀有度分布：普通 18 / 稀有 43 / 史诗 21', () => {
    const n = { common: 0, rare: 0, epic: 0 }
    for (const m of MONSTER_DEFS) n[m.rarity]++
    expect(n).toEqual({ common: 18, rare: 43, epic: 21 })
  })

  it('太空与神庙的新增怪全部非普通 —— 否则会造出训练里永不出现的怪', () => {
    // 储备池筛的是 rarity !== 'common'，而 6 只 BASE 写死在 Stage 里：
    // 给这两个世界加 common，它就既不在 BASE 也不在储备，只存在于图鉴。
    expect(monstersOfWorld('space').filter((m) => m.rarity === 'common').length).toBe(6)
    expect(monstersOfWorld('shrine').filter((m) => m.rarity === 'common').length).toBe(6)
    expect(reserveMonstersOfWorld('space').length).toBe(27)
    expect(reserveMonstersOfWorld('shrine').length).toBe(27)
  })

  it('森林 6 只普通进 BASE、10 只非普通进储备', () => {
    expect(monstersOfWorld('forest').filter((m) => m.rarity === 'common').length).toBe(6)
    expect(reserveMonstersOfWorld('forest').length).toBe(10)
  })

  it('id 全局唯一', () => {
    const ids = MONSTER_DEFS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('id 不含冒号 —— 同步 uuid 反解靠"自然键侧不含冒号"', () => {
    for (const m of MONSTER_DEFS) expect(m.id.includes(':'), m.id).toBe(false)
  })

  it('每条 def 的 world 都在 WORLDS 里，且 id 以世界名开头', () => {
    for (const m of MONSTER_DEFS) {
      expect(WORLDS).toContain(m.world)
      expect(m.id.startsWith(`${m.world}-`), m.id).toBe(true)
    }
  })
})

describe('WORLDS —— 加世界只改这一个数组', () => {
  it('三个世界，顺序固定（图鉴分组按它渲染）', () => {
    expect([...WORLDS]).toEqual(['space', 'shrine', 'forest'])
  })

  it('emptyByWorld 为每个世界建同样的初值，且键恰为 WORLDS', () => {
    const zero = emptyByWorld(() => 0)
    expect(Object.keys(zero).sort()).toEqual([...WORLDS].sort())
    expect(Object.values(zero)).toEqual(WORLDS.map(() => 0))
  })

  it('emptyByWorld 每个世界拿到独立实例，不是共享同一个引用', () => {
    // 若写成 Object.fromEntries(WORLDS.map(w => [w, []]))，三个世界会共享同一个数组，
    // 往一个世界 push 会串到另外两个
    const lists = emptyByWorld<string[]>(() => [])
    lists.space.push('x')
    expect(lists.shrine).toEqual([])
    expect(lists.forest).toEqual([])
  })

  it('isWorld 只认这三个（皮肤 id 里 plain / random 不是世界）', () => {
    expect(isWorld('space')).toBe(true)
    expect(isWorld('forest')).toBe(true)
    expect(isWorld('plain')).toBe(false)
    expect(isWorld('random')).toBe(false)
  })
})
