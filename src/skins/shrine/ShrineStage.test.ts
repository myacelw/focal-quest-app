import { describe, it, expect } from 'vitest'
import { guardianForSeq } from './ShrineStage'

describe('guardianForSeq — 守护者每题轮换', () => {
  it('第 0 题是精灵型火焰骷髅', () => {
    const g = guardianForSeq(0)
    expect(g.kind).toBe('sprite')
    expect(g.name).toBe('火焰骷髅')
  })
  it('逐题轮换到不同怪兽', () => {
    expect(guardianForSeq(1).name).toBe('青焰龙')
    expect(guardianForSeq(2).name).toBe('赤角鬼')
  })
  it('转满一圈（池长 6）回到起点', () => {
    expect(guardianForSeq(6).name).toBe(guardianForSeq(0).name)
    expect(guardianForSeq(7).name).toBe(guardianForSeq(1).name)
  })
  it('负数/异常 seq 兜底不越界', () => {
    expect(guardianForSeq(-1)).toBeDefined()
    expect(guardianForSeq(-6).name).toBe('火焰骷髅')
  })
})
