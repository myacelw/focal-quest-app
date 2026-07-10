import { describe, it, expect } from 'vitest'
import { enemyForSeq, buildEnemyPool } from './SpaceStage'

describe('enemyForSeq — 敌人每题轮换', () => {
  it('第 0 题是图片型敌方战舰', () => {
    expect(enemyForSeq(0).kind).toBe('img')
    expect(enemyForSeq(0).name).toBe('enemy')
  })
  it('逐题轮换到不同敌人', () => {
    expect(enemyForSeq(1).name).toBe('ufo')
    expect(enemyForSeq(2).name).toBe('alien')
  })
  it('转满一圈（池长 6）回起点', () => {
    expect(enemyForSeq(6).name).toBe(enemyForSeq(0).name)
    expect(enemyForSeq(7).name).toBe(enemyForSeq(1).name)
  })
  it('负数兜底不越界', () => {
    expect(enemyForSeq(-6).name).toBe('enemy')
  })
})

describe('皮肤池联动 — 已捕获的储备怪加入轮换', () => {
  it('buildEnemyPool 无捕获时只有基础 6 只', () => {
    expect(buildEnemyPool()).toHaveLength(6)
    expect(buildEnemyPool([])).toHaveLength(6)
  })
  it('未捕获对应 id 时，传入的储备 id 不生效', () => {
    expect(buildEnemyPool(['space-not_a_real_monster'])).toHaveLength(6)
  })
  it('捕获 space-comet_rider 后池长 7，第 6 题变为 comet_rider', () => {
    expect(buildEnemyPool(['space-comet_rider'])).toHaveLength(7)
    expect(enemyForSeq(6, ['space-comet_rider']).name).toBe('comet_rider')
    expect(enemyForSeq(0, ['space-comet_rider']).name).toBe('enemy') // 基础池顺序不变
  })
  it('捕获多只储备怪后顺序：基础 + 已捕获储备（按 id 排序）', () => {
    // 捕获 comet_rider、gravity_orb（id 字典序 comet_rider < gravity_orb）
    const pool = buildEnemyPool(['space-gravity_orb', 'space-comet_rider'])
    expect(pool).toHaveLength(8)
    expect(pool[6].name).toBe('comet_rider')
    expect(pool[7].name).toBe('gravity_orb')
  })
  it('无参调用回退基础池（向后兼容）', () => {
    expect(enemyForSeq(0)).toEqual(enemyForSeq(0, []))
  })
})
