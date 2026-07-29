import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import { WORLDS, MONSTER_DEFS, shinyIdOf } from './monster-defs'
import { getDexProgress, getOwnedReserveIdsByWorld, captureMonster } from './dex-service'

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

  it('还没捕获 forest 怪时 byWorld 是 0；byWorldTotal 派生自 MONSTER_DEFS，随扩池自动变成 16（不再硬编码 0）', async () => {
    const p = await getDexProgress()
    expect(p.byWorld.forest).toBe(0)
    expect(p.byWorldTotal.forest).toBe(16)
  })
})

describe('闪光行与普通计数互不串', () => {
  const first = MONSTER_DEFS[0]

  it('owned 只数本体、shinyOwned 只数闪光 —— 闪光行不能把 owned 顶到 82 以上', async () => {
    // 这是真实缺陷的回归锚：owned 原本取 db 里全部行的 size，
    // 闪光是独立行，不修会让首页显示「95/82」。
    await db.monsters.put({ id: first.id, capturedAt: 1, source: 'daily' })
    await db.monsters.put({ id: shinyIdOf(first.id), capturedAt: 2, source: 'daily' })
    const p = await getDexProgress()
    expect(p.owned).toBe(1)
    expect(p.shinyOwned).toBe(1)
    expect(p.total).toBe(MONSTER_DEFS.length)
  })

  it('只有闪光、没有本体时：owned 是 0，shinyOwned 是 1，byWorld 也是 0', async () => {
    await db.monsters.put({ id: shinyIdOf(first.id), capturedAt: 1, source: 'daily' })
    const p = await getDexProgress()
    expect(p.owned).toBe(0)
    expect(p.shinyOwned).toBe(1)
    expect(p.byWorld[first.world]).toBe(0)
  })

  it('getOwnedReserveIdsByWorld 不返回闪光 id（否则闪光会混进训练轮换池）', async () => {
    const reserve = MONSTER_DEFS.find((m) => m.rarity !== 'common')!
    await db.monsters.put({ id: shinyIdOf(reserve.id), capturedAt: 1, source: 'daily' })
    const r = await getOwnedReserveIdsByWorld()
    expect(r[reserve.world]).toEqual([])
  })

  it('captureMonster 抽中闪光时落库的是闪光 id', async () => {
    // 先把全部本体占满，逼它只能出闪光
    await db.monsters.bulkPut(MONSTER_DEFS.map((m) => ({ id: m.id, capturedAt: 1, source: 'daily' as const })))
    const r = await captureMonster('daily', '2026-07-28', 1_700_000_000_000)
    expect(r).not.toBeNull()
    expect(r!.shiny).toBe(true)
    const rows = await db.monsters.toArray()
    expect(rows.some((x) => x.id === shinyIdOf(r!.def.id))).toBe(true)
  })
})
