import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import { WORLDS } from './monster-defs'
import { getDexProgress, getOwnedReserveIdsByWorld } from './dex-service'

beforeEach(async () => { await db.monsters.clear() })

describe('dex-service 的分世界统计从 WORLDS 派生', () => {
  it('getDexProgress 的 byWorld / byWorldTotal 键恰为 WORLDS（不是写死的两个世界）', async () => {
    const p = await getDexProgress()
    expect(Object.keys(p.byWorld).sort()).toEqual([...WORLDS].sort())
    expect(Object.keys(p.byWorldTotal).sort()).toEqual([...WORLDS].sort())
  })

  it('getOwnedReserveIdsByWorld 的键也恰为 WORLDS', async () => {
    const r = await getOwnedReserveIdsByWorld()
    expect(Object.keys(r).sort()).toEqual([...WORLDS].sort())
  })

  it('还没有 forest 怪时，forest 的计数是 0 而不是 undefined（空世界不能炸）', async () => {
    const p = await getDexProgress()
    expect(p.byWorld.forest).toBe(0)
    expect(p.byWorldTotal.forest).toBe(0)
  })
})
