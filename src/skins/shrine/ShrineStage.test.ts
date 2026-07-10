import { describe, it, expect } from 'vitest'
import { guardianForSeq, buildGuardianPool } from './ShrineStage'

describe('guardianForSeq — 守护者每题轮换', () => {
  it('第 0 题是精灵型火焰骷髅', () => {
    const g = guardianForSeq(0)
    expect(g.kind).toBe('sprite')
    expect(g.name).toBe('skeleton')
  })
  it('逐题轮换到不同怪兽', () => {
    expect(guardianForSeq(1).name).toBe('dragon')
    expect(guardianForSeq(2).name).toBe('oni')
  })
  it('转满一圈（池长 6）回到起点', () => {
    expect(guardianForSeq(6).name).toBe(guardianForSeq(0).name)
    expect(guardianForSeq(7).name).toBe(guardianForSeq(1).name)
  })
  it('负数/异常 seq 兜底不越界', () => {
    expect(guardianForSeq(-1)).toBeDefined()
    expect(guardianForSeq(-6).name).toBe('skeleton')
  })
})

describe('皮肤池联动 — 已捕获的储备怪加入轮换', () => {
  it('buildGuardianPool 无捕获时只有基础 6 只', () => {
    expect(buildGuardianPool()).toHaveLength(6)
    expect(buildGuardianPool([])).toHaveLength(6)
  })
  it('未捕获对应 id 时，传入的储备 id 不生效', () => {
    expect(buildGuardianPool(['shrine-not_a_real_monster'])).toHaveLength(6)
  })
  it('捕获 shrine-golem 后池长 7，第 6 题变为 golem', () => {
    expect(buildGuardianPool(['shrine-golem'])).toHaveLength(7)
    expect(guardianForSeq(6, ['shrine-golem']).name).toBe('golem')
    expect(guardianForSeq(0, ['shrine-golem']).name).toBe('skeleton')
  })
  it('捕获多只储备怪后顺序：基础 + 已捕获储备（按 id 排序）', () => {
    // chimera_cub < golem 字典序
    const pool = buildGuardianPool(['shrine-golem', 'shrine-chimera_cub'])
    expect(pool).toHaveLength(8)
    expect(pool[6].name).toBe('chimera_cub')
    expect(pool[7].name).toBe('golem')
  })
  it('储备怪都是 img 类型（无 sprite 储备）', () => {
    const pool = buildGuardianPool(['shrine-golem', 'shrine-wisp'])
    expect(pool[6].kind).toBe('img')
    expect(pool[7].kind).toBe('img')
  })
  it('无参调用回退基础池（向后兼容）', () => {
    expect(guardianForSeq(0)).toEqual(guardianForSeq(0, []))
  })
})
