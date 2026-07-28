import { describe, it, expect } from 'vitest'
import { buildRotationPool, pickForSeq } from './rotation'

type Item = { name: string }
const BASE: Item[] = [{ name: 'a' }, { name: 'b' }]
const RESERVE: Item[] = [{ name: 'x' }, { name: 'y' }]

describe('buildRotationPool', () => {
  it('无捕获时只有基础池', () => {
    expect(buildRotationPool(BASE, RESERVE, 'w').map((i) => i.name)).toEqual(['a', 'b'])
    expect(buildRotationPool(BASE, RESERVE, 'w', []).map((i) => i.name)).toEqual(['a', 'b'])
  })

  it('只有 world-name 完全匹配的 id 才把储备项拉进来', () => {
    expect(buildRotationPool(BASE, RESERVE, 'w', ['w-x']).map((i) => i.name)).toEqual(['a', 'b', 'x'])
    // 别的世界的同名 id 不算数——否则捕获太空怪会点亮神庙的轮换池
    expect(buildRotationPool(BASE, RESERVE, 'w', ['other-x']).map((i) => i.name)).toEqual(['a', 'b'])
    // 不在储备里的 id 也不算数
    expect(buildRotationPool(BASE, RESERVE, 'w', ['w-zzz']).map((i) => i.name)).toEqual(['a', 'b'])
  })

  it('储备项按 reserve 传入的顺序追加在基础池之后', () => {
    expect(buildRotationPool(BASE, RESERVE, 'w', ['w-y', 'w-x']).map((i) => i.name)).toEqual(['a', 'b', 'x', 'y'])
  })
})

describe('pickForSeq', () => {
  it('按 seq 循环取模', () => {
    const pool = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]
    expect(pickForSeq(pool, 0).name).toBe('a')
    expect(pickForSeq(pool, 2).name).toBe('c')
    expect(pickForSeq(pool, 3).name).toBe('a')
  })

  it('负数 seq 不越界 —— JS 的 % 对负数返回负值，必须再加一次 n', () => {
    const pool = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]
    expect(pickForSeq(pool, -1).name).toBe('c')
    expect(pickForSeq(pool, -3).name).toBe('a')
    expect(pickForSeq(pool, -4).name).toBe('c')
  })
})
