import { describe, it, expect } from 'vitest'
import {
  MONSTER_DEFS, TOTAL_MONSTERS, monstersOfWorld, reserveMonstersOfWorld, getMonsterDef,
  type World, type Rarity,
} from './monster-defs'
// 直接引用皮肤池里的 name slug，验证现役 12 只 id 与之对齐
import { enemyForSeq } from '../skins/space/SpaceStage'
import { guardianForSeq } from '../skins/shrine/ShrineStage'

describe('MONSTER_DEFS', () => {
  it('共 34 只（每世界 17 = 6 普 + 8 稀 + 3 史）', () => {
    expect(TOTAL_MONSTERS).toBe(34)
    expect(MONSTER_DEFS).toHaveLength(34)
  })

  it('id 唯一', () => {
    expect(new Set(MONSTER_DEFS.map((m) => m.id)).size).toBe(34)
  })

  it('每世界 17 只且稀有度结构正确', () => {
    for (const w of ['space', 'shrine'] as World[]) {
      const list = monstersOfWorld(w)
      expect(list).toHaveLength(17)
      expect(list.filter((m) => m.rarity === 'common')).toHaveLength(6)
      expect(list.filter((m) => m.rarity === 'rare')).toHaveLength(8)
      expect(list.filter((m) => m.rarity === 'epic')).toHaveLength(3)
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

  it('reserveMonstersOfWorld 排除现役（rarity !== common）每世界 11 只', () => {
    expect(reserveMonstersOfWorld('space')).toHaveLength(11)
    expect(reserveMonstersOfWorld('shrine')).toHaveLength(11)
  })

  it('现役 12 只 id 与皮肤池 slug 对齐（space-enemy / shrine-skeleton 等）', () => {
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
  })

  it('所有 monster 的 nameKey 都以 world 前缀开头', () => {
    for (const m of MONSTER_DEFS) {
      const prefix = m.world === 'space' ? 'space.enemy.' : 'shrine.guardian.'
      expect(m.nameKey.startsWith(prefix)).toBe(true)
    }
  })
})
