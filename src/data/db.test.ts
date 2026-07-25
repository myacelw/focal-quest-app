import { describe, it, expect } from 'vitest'
import { db } from './db'

/**
 * 本文件是"Dexie 能在单测里跑起来"的地基验证。
 * 既有 241 个测试全是纯函数、从不碰 IndexedDB；本迭代要迁移用户既有数据，
 * 没有这层地基就只能靠手测，风险不可接受。
 */
describe('Dexie 在测试环境可用（fake-indexeddb 基建）', () => {
  it('能打开库，7 张业务表齐全', async () => {
    await db.open()
    const names = db.tables.map((t) => t.name)
    for (const n of ['sessions', 'checkins', 'badges', 'monsters', 'rewards', 'redemptions', 'exams']) {
      expect(names).toContain(n)
    }
  })

  it('sessions 可写可读（自增主键生效）', async () => {
    const id = await db.sessions.add({
      date: '2026-07-25', startedAtMs: 1_700_000_000_000, eye: 'left',
      answered: 10, correct: 9, flips: 9, elapsedSec: 180, acuity: 0.8,
    })
    expect(typeof id).toBe('number')
    const row = await db.sessions.get(id)
    expect(row?.correct).toBe(9)
  })

  it('checkins 以 date 为主键，put 覆盖同一天', async () => {
    await db.checkins.put({ date: '2026-07-25', streak: 1, dailyPoints: 30, totalPoints: 30 })
    await db.checkins.put({ date: '2026-07-25', streak: 1, dailyPoints: 75, totalPoints: 75 })
    expect(await db.checkins.count()).toBe(1)
    expect((await db.checkins.get('2026-07-25'))?.dailyPoints).toBe(75)
  })

  it('MODE 为 test —— api.ts 的"测试不发网络"守卫依赖这个前提', () => {
    expect(import.meta.env.MODE).toBe('test')
  })
})
