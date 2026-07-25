import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { enqueuePut, pushAll, pushSession, pushExamDeleted } from './api'
import { setKick, kickSync } from '../sync/kick'
import { addExam, deleteExam } from '../exams/exams-service'

/** pushXxx 是 fire-and-forget（不返回 Promise），测试里轮询等它落库 */
async function waitFor(fn: () => Promise<boolean>, ms = 2000): Promise<void> {
  const t0 = Date.now()
  for (;;) {
    if (await fn()) return
    if (Date.now() - t0 > ms) throw new Error('等待落库超时')
    await new Promise((r) => setTimeout(r, 5))
  }
}

beforeEach(async () => {
  await Promise.all([
    db.sessions.clear(), db.checkins.clear(), db.badges.clear(), db.monsters.clear(),
    db.rewards.clear(), db.redemptions.clear(), db.exams.clear(), db.outbox.clear(),
  ])
})

describe('入队：uuid 回填与 payload 形状', () => {
  it('pushSession 最终写出 1 条 outbox，并把 uuid 回填到 sessions 行', async () => {
    const id = await db.sessions.add({
      date: '2026-07-25', startedAtMs: 1, eye: 'left',
      answered: 10, correct: 9, flips: 9, elapsedSec: 180, acuity: 0.8,
    })
    pushSession({
      id, date: '2026-07-25', startedAtMs: 1, eye: 'left',
      answered: 10, correct: 9, flips: 9, elapsedSec: 180, acuity: 0.8,
    })
    await waitFor(async () => (await db.outbox.count()) === 1)
    const row = await db.sessions.get(id)
    const box = (await db.outbox.toArray())[0]
    // 回填是硬要求：自增表若每次重算 uuid，云端会长出一堆永不更新的孤儿记录
    expect(row?.uuid).toBe(box.uuid)
    expect(box.op).toBe('put')
    expect(box.kind).toBe('session')
  })

  it('outbox payload 剥掉本地 id（各设备独立自增的号，带过去会覆盖对面不相干的行）', async () => {
    const id = await db.rewards.add({ title: '看动画片', cost: 200, active: true, createdAt: 5 })
    await enqueuePut('reward', [{ id, title: '看动画片', cost: 200, active: true, createdAt: 5 }])
    const box = (await db.outbox.toArray())[0]
    expect((box.payload as Record<string, unknown>).id).toBeUndefined()
    expect((box.payload as Record<string, unknown>).title).toBe('看动画片')
  })

  it('checkin 的 uuid 是确定性的（含 profileId 一段），payload 保留自然键 date', async () => {
    await enqueuePut('checkin', [{ date: '2026-07-20', streak: 1, dailyPoints: 30, totalPoints: 30 }])
    const box = (await db.outbox.toArray())[0]
    expect(box.uuid).toBe('checkin:default:2026-07-20')
    expect((box.payload as Record<string, unknown>).date).toBe('2026-07-20')
  })

  it('同一天二次入队得到两条 outbox、但 uuid 相同（服务端按 uuid 收敛成一行）', async () => {
    await enqueuePut('checkin', [{ date: '2026-07-20', streak: 1, dailyPoints: 30, totalPoints: 30 }])
    const first = await db.checkins.get('2026-07-20')
    await enqueuePut('checkin', [{ ...first!, streak: 2 }])
    const boxes = await db.outbox.toArray()
    expect(boxes.length).toBe(2)
    expect(boxes[0].uuid).toBe(boxes[1].uuid)
  })

  it('空数组不写 outbox（既有调用点会传空数组）', async () => {
    await enqueuePut('badge', [])
    expect(await db.outbox.count()).toBe(0)
  })

  it('多条勋章各自入队，uuid 为 badge:default:<id>', async () => {
    await enqueuePut('badge', [{ id: 'first-session', unlockedAt: 1 }, { id: 'streak-7', unlockedAt: 2 }])
    expect((await db.outbox.toArray()).map((b) => b.uuid))
      .toEqual(['badge:default:first-session', 'badge:default:streak-7'])
  })
})

describe('入队：时间戳', () => {
  it('未来时间戳被钳到当下 —— 否则服务端整批 400、这一批永远发不出去', async () => {
    // 真实触发路径：iPad 系统时间被调快超过 24 小时（服务端 maxClockSkewMs = 24h，
    // 且 validatePushRecords 是整批全或无），这些行会永久卡在队首把同步链彻底堵死。
    const future = Date.now() + 10 * 86_400_000
    await db.badges.put({ id: 'skewed', unlockedAt: 1, uuid: 'badge:default:skewed', updatedAt: future, profileId: 'default' })
    await pushAll()
    const box = (await db.outbox.toArray())[0]
    expect(box.updatedAt).toBeLessThanOrEqual(Date.now())
  })

  it('keepUpdatedAt 遇上没有 updatedAt 的老备份行：用行内业务时间戳，不用 now', async () => {
    // restoreBackup 恢复 v6 之前导出的备份时，行里根本没有 updatedAt。
    // 若退化成 now，本设备会凭 LWW 压掉另一台设备后写的合法新值。
    await db.badges.put({ id: 'legacy', unlockedAt: 4321 }) // 刻意不带 uuid / updatedAt
    await pushAll()
    const box = (await db.outbox.toArray()).find((b) => b.uuid === 'badge:default:legacy')
    expect(box?.updatedAt).toBe(4321)
  })
})

describe('墓碑', () => {
  it('pushExamDeleted 写出 op=delete 的墓碑记录', async () => {
    pushExamDeleted('exam-uuid-1')
    await waitFor(async () => (await db.outbox.count()) === 1)
    const box = (await db.outbox.toArray())[0]
    expect(box.op).toBe('delete')
    expect(box.kind).toBe('exam')
    expect(box.payload).toEqual({ _deleted: true })
  })

  it('deleteExam 删掉本地行并推墓碑（3b 起删除必须传播，否则会被别的设备复活）', async () => {
    await addExam({ date: '2026-07-01', left: 0.6, right: 0.8 })
    await waitFor(async () => (await db.outbox.count()) === 1)
    const exam = (await db.exams.toArray())[0]
    await db.outbox.clear()

    await deleteExam(exam.id!)
    await waitFor(async () => (await db.outbox.count()) === 1)
    expect(await db.exams.count()).toBe(0)
    const box = (await db.outbox.toArray())[0]
    expect(box.uuid).toBe(exam.uuid)
    expect(box.op).toBe('delete')
  })
})

describe('pushAll — 全量入队（注册/登录/恢复备份后用）', () => {
  it('把 7 张表整体入队', async () => {
    await db.sessions.add({ date: '2026-07-20', startedAtMs: 1, eye: 'left', answered: 1, correct: 1, flips: 1, elapsedSec: 60, acuity: 0.8 })
    await db.checkins.put({ date: '2026-07-20', streak: 1, dailyPoints: 35, totalPoints: 35 })
    await db.badges.put({ id: 'first-session', unlockedAt: 2 })
    await db.monsters.put({ id: 'sp-ufo', capturedAt: 3, source: 'daily' })
    await db.rewards.add({ title: '看动画片', cost: 200, active: true, createdAt: 4 })
    await db.redemptions.add({ kind: 'reward', title: '看动画片', cost: 200, createdAt: 5, createdDate: '2026-07-20', status: 'pending' })
    await db.exams.add({ date: '2026-07-01', left: 0.6, right: 0.8 })

    await pushAll()
    expect(await db.outbox.count()).toBe(7)
  })

  it('保留行内既有 updatedAt——否则登录时会用本机时间 LWW 压掉另一台设备后写的修改', async () => {
    await db.badges.put({ id: 'first-session', unlockedAt: 2, uuid: 'badge:first-session', updatedAt: 111, profileId: 'default' })
    await pushAll()
    const box = (await db.outbox.toArray())[0]
    expect(box.updatedAt).toBe(111)
    expect((await db.badges.get('first-session'))?.updatedAt).toBe(111)
  })
})

describe('kick 钩子（打断 api ↔ engine 的循环依赖）', () => {
  // ⚠️ 本用例必须排在下一条之前：setKick 是模块级单例，没有反注册接口
  it('未注册实现时 kickSync 是空操作，不抛错', () => {
    expect(() => kickSync()).not.toThrow()
  })

  it('setKick 注册后 kickSync 能调到', () => {
    let n = 0
    setKick(() => { n += 1 })
    kickSync()
    expect(n).toBe(1)
  })
})
