import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import { syncNow, type Transport, type PushRecordDto, type PulledRecordDto } from './engine'
import { saveAccount, getLastPulledSeq, getMeta, META } from './account'
import { enqueuePut } from '../data/api'

const TOKEN = 'a'.repeat(64)

async function login(): Promise<void> {
  await saveAccount({ userId: 'u1', email: 'p@example.com', token: TOKEN, inviteCode: 'ABCDEFGH', isAdmin: false })
}

interface Page {
  records: PulledRecordDto[]
  nextSince: number
  hasMore: boolean
}
interface Fake extends Transport {
  pushed: PushRecordDto[][]
  pulls: number[]
}

/**
 * 假 transport：记下每次调用，按脚本吐页。单测不碰网络，只验编排逻辑。
 *  - `pushStatus`：所有 push 都失败并返回这个状态码（模拟断网 0 / 5xx / 401 / 400）；
 *  - `rejectUuid`：只有**含这条 uuid 的批次**返回 400，用来验二分定位。
 */
function fake(opts: {
  pushStatus?: number
  rejectUuid?: string
  pullOk?: boolean
  throwOnPush?: boolean
  pages?: Page[]
} = {}): Fake {
  const pages = opts.pages ?? [{ records: [], nextSince: 0, hasMore: false }]
  let idx = 0
  const f: Fake = {
    pushed: [],
    pulls: [],
    async push(records) {
      if (opts.throwOnPush) throw new Error('boom')
      if (opts.pushStatus !== undefined) return { ok: false, status: opts.pushStatus }
      if (opts.rejectUuid !== undefined && records.some((r) => r.uuid === opts.rejectUuid)) {
        return { ok: false, status: 400 } // 服务端整批校验：一条不合规就整批被拒
      }
      f.pushed.push(records)
      return { ok: true, status: 200 }
    },
    async pull(since) {
      f.pulls.push(since)
      const p = pages[Math.min(idx, pages.length - 1)]
      idx += 1
      if (opts.pullOk === false) return { ok: false, status: 500, records: [], nextSince: since, hasMore: false }
      return { ok: true, status: 200, ...p }
    },
  }
  return f
}

function rec(over: Partial<PulledRecordDto>): PulledRecordDto {
  return { uuid: 'x', profileId: 'default', kind: 'session', payload: {}, updatedAt: 1, seq: 1, ...over }
}

beforeEach(async () => {
  await Promise.all([
    db.sessions.clear(), db.checkins.clear(), db.badges.clear(), db.monsters.clear(),
    db.rewards.clear(), db.redemptions.clear(), db.exams.clear(),
    db.outbox.clear(), db.syncMeta.clear(),
  ])
})

describe('syncNow — 前置与推送', () => {
  it('没登录时直接跳过，一个请求都不发，并顺手清掉 outbox（只进不出会无界增长）', async () => {
    // 未登录是**默认状态**（不注册也能全功能使用是本项目红线）。每节训练/打卡/勋章/图鉴
    // 都往 outbox 塞行、永不清理，约 20 行/天、一年几千行，纯属无用堆积。
    await db.outbox.add({ uuid: 'x', kind: 'exam', payload: {}, updatedAt: 1, op: 'put' })
    const t = fake()
    expect(await syncNow(t)).toBe('skipped')
    expect(t.pushed.length).toBe(0)
    expect(t.pulls.length).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('push 成功后 outbox 清空', async () => {
    await login()
    await enqueuePut('checkin', [{ date: '2026-07-20', streak: 1, dailyPoints: 30, totalPoints: 30 }])
    expect(await db.outbox.count()).toBe(1)
    expect(await syncNow(fake())).toBe('ok')
    expect(await db.outbox.count()).toBe(0)
  })

  it('5xx 失败时 outbox 原样保留（下次退避重试补传，绝不丢数据）', async () => {
    await login()
    await enqueuePut('badge', [{ id: 'first-session', unlockedAt: 1 }])
    expect(await syncNow(fake({ pushStatus: 500 }))).toBe('failed')
    expect(await db.outbox.count()).toBe(1)
  })

  it('400 永久拒绝：二分定位坏记录，只隔离它，其余照常送出，lastError=rejected', async () => {
    // 服务端 validatePushRecords 是整批全或无。若不区分暂时/永久，一条永久非法的记录
    // （最现实的成因：设备时钟、超大 payload）会永远卡在队首，让这台设备**从此再也同步不了
    // 任何数据**，而且全程静默——家长只看到"N 条待上传"一直涨。
    await login()
    await enqueuePut('badge', [{ id: 'a', unlockedAt: 1 }, { id: 'bad', unlockedAt: 2 }, { id: 'c', unlockedAt: 3 }])
    expect(await db.outbox.count()).toBe(3)

    const t = fake({ rejectUuid: 'badge:default:bad' })
    expect(await syncNow(t)).toBe('ok')
    // 坏记录被隔离（从队列移除），另两条真的发出去了
    expect(await db.outbox.count()).toBe(0)
    expect(t.pushed.flat().map((r) => r.uuid).sort()).toEqual(['badge:default:a', 'badge:default:c'])
    expect(await getMeta(META.lastError)).toBe('rejected')
  })

  it('401：outbox 原样保留、lastError=unauthorized、返回 unauthorized 让排程停下来', async () => {
    // 拿着已失效的 token 按退避重试到天荒地老毫无意义；要等用户在设置页重新登录
    await login()
    await enqueuePut('badge', [{ id: 'first-session', unlockedAt: 1 }])
    expect(await syncNow(fake({ pushStatus: 401 }))).toBe('unauthorized')
    expect(await db.outbox.count()).toBe(1)
    expect(await getMeta(META.lastError)).toBe('unauthorized')
  })

  it('补扫：没有 uuid 也不在 outbox 的孤儿行会被捞回来推送', async () => {
    // 可达状态：saveSession 在 db.sessions.add 后就返回了，uuid 回填与入队在之后的
    // microtask 里；此时切后台 / Safari 回收页面 / IndexedDB 短暂报错，就留下一条永不上云的行。
    // 而 pushAll() 只在注册/登录/恢复备份时调用，正常使用永远不会再触发。
    await login()
    await db.sessions.add({
      date: '2026-07-20', startedAtMs: 7777, eye: 'right',
      answered: 10, correct: 9, flips: 9, elapsedSec: 180, acuity: 0.8,
    })
    const t = fake()
    expect(await syncNow(t)).toBe('ok')
    expect(t.pushed.flat().map((r) => r.uuid)).toContain('session:default:7777:right')
    expect((await db.sessions.toArray())[0].uuid).toBe('session:default:7777:right')
  })

  it('同 uuid 的多条只发最后一条，但两条都被清掉', async () => {
    await login()
    const id = await db.exams.add({ date: '2026-07-01', left: 0.6, right: 0.8 })
    await enqueuePut('exam', [{ id, date: '2026-07-01', left: 0.6, right: 0.8 }])
    const saved = await db.exams.get(id)
    await enqueuePut('exam', [{ ...saved!, left: 0.8 }])
    expect(await db.outbox.count()).toBe(2)

    const t = fake()
    expect(await syncNow(t)).toBe('ok')
    expect(t.pushed[0].length).toBe(1)
    expect(await db.outbox.count()).toBe(0)
  })

  it('并发调用不重入：第二次返回 busy', async () => {
    await login()
    await enqueuePut('exam', [{ id: 1, date: '2026-07-01', left: 0.6, right: 0.8 }])
    const slow: Transport = {
      async push() {
        await new Promise((r) => setTimeout(r, 30))
        return { ok: true, status: 200 }
      },
      async pull(since) {
        return { ok: true, status: 200, records: [], nextSince: since, hasMore: false }
      },
    }
    const both = await Promise.all([syncNow(slow), syncNow(slow)])
    expect(both.filter((x) => x === 'busy').length).toBe(1)
  })
})

describe('syncNow — 拉取与合并', () => {
  it('把新记录写入本地（自增表按 uuid 落一行并分配本地 id）', async () => {
    await login()
    const t = fake({ pages: [{ nextSince: 7, hasMore: false, records: [rec({
      uuid: 'sess-1', kind: 'session', updatedAt: 100, seq: 7,
      payload: { date: '2026-07-20', startedAtMs: 5, eye: 'left', answered: 10, correct: 9, flips: 9, elapsedSec: 180, acuity: 0.8 },
    })] }] })
    expect(await syncNow(t)).toBe('ok')
    const rows = await db.sessions.toArray()
    expect(rows.length).toBe(1)
    expect(rows[0].uuid).toBe('sess-1')
    expect(typeof rows[0].id).toBe('number')
  })

  it('走 LWW：更旧的远端不覆盖本地', async () => {
    await login()
    const id = await db.exams.add({ date: '2026-07-01', left: 0.9, right: 0.9, uuid: 'exam-1', updatedAt: 500, profileId: 'default' })
    const t = fake({ pages: [{ nextSince: 3, hasMore: false, records: [rec({
      uuid: 'exam-1', kind: 'exam', updatedAt: 100, seq: 3, payload: { date: '2026-07-01', left: 0.2, right: 0.2 },
    })] }] })
    await syncNow(t)
    expect((await db.exams.get(id))?.left).toBe(0.9)
  })

  it('勋章取最早：本地较晚的 unlockedAt 被换成更早的（纯 LWW 会在这里犯错）', async () => {
    await login()
    await db.badges.put({ id: 'streak-7', unlockedAt: 900, uuid: 'badge:default:streak-7', updatedAt: 900, profileId: 'default' })
    const t = fake({ pages: [{ nextSince: 4, hasMore: false, records: [rec({
      uuid: 'badge:default:streak-7', kind: 'badge', updatedAt: 100, seq: 4, payload: { id: 'streak-7', unlockedAt: 100 },
    })] }] })
    await syncNow(t)
    expect((await db.badges.get('streak-7'))?.unlockedAt).toBe(100)
  })

  it('墓碑按 uuid 索引删掉本地 exam 行（自增表走 where("uuid") 分支）', async () => {
    await login()
    await db.exams.add({ date: '2026-07-01', left: 0.6, right: 0.8, uuid: 'exam-9', updatedAt: 10, profileId: 'default' })
    const t = fake({ pages: [{ nextSince: 5, hasMore: false, records: [rec({
      uuid: 'exam-9', kind: 'exam', updatedAt: 20, seq: 5, payload: { _deleted: true },
    })] }] })
    await syncNow(t)
    expect(await db.exams.count()).toBe(0)
  })

  it('墓碑靠 uuid 反解自然键删掉本地 checkin 行（KEYED 表走 naturalKeyFromUuid 分支）', async () => {
    // payload 里只有 {_deleted:true}、没有 date，只能从 uuid 的最后一段反解才找得到本地行。
    // 这条用例锚定 deterministicUuid 的拼接格式——把 ':' 换成别的分隔符就会在这里红。
    await login()
    await db.checkins.put({
      date: '2026-07-20', streak: 1, dailyPoints: 30, totalPoints: 30,
      uuid: 'checkin:default:2026-07-20', updatedAt: 10, profileId: 'default',
    })
    const t = fake({ pages: [{ nextSince: 2, hasMore: false, records: [rec({
      uuid: 'checkin:default:2026-07-20', kind: 'checkin', updatedAt: 20, seq: 2, payload: { _deleted: true },
    })] }] })
    await syncNow(t)
    expect(await db.checkins.count()).toBe(0)
  })

  it('拉取后打卡链被整体重算，修正结果**本轮就发走**（outbox 归零）', async () => {
    await login()
    // 本地已有 20 日（自认为 streak 1）；从另一台设备拉到 21 日，它也自认为 streak 1
    await db.checkins.put({ date: '2026-07-20', streak: 1, dailyPoints: 80, totalPoints: 80, uuid: 'checkin:default:2026-07-20', updatedAt: 10, profileId: 'default' })
    const t = fake({ pages: [{ nextSince: 6, hasMore: false, records: [rec({
      uuid: 'checkin:default:2026-07-21', kind: 'checkin', updatedAt: 20, seq: 6,
      payload: { date: '2026-07-21', streak: 1, dailyPoints: 80, totalPoints: 80 },
    })] }] })
    expect(await syncNow(t)).toBe('ok')

    const all = (await db.checkins.toArray()).sort((a, b) => (a.date < b.date ? -1 : 1))
    expect(all.map((c) => c.streak)).toEqual([1, 2])
    expect(all[1].totalPoints).toBe(160)
    // 重算结果必须在同一轮推走：否则 syncNow 返回 'ok' 时 outbox 里还躺着行，
    // 设置页会同时显示「同步完成 ✓」和「N 条待上传」，家长以为同步坏了。
    expect(await db.outbox.count()).toBe(0)
    expect(t.pushed.flat().map((r) => r.uuid)).toContain('checkin:default:2026-07-21')
  })

  it('游标推进到 nextSince 并持久化（首次从 0 拉）', async () => {
    await login()
    const t = fake({ pages: [{ records: [], nextSince: 88, hasMore: false }] })
    await syncNow(t)
    expect(t.pulls[0]).toBe(0)
    expect(await getLastPulledSeq()).toBe(88)
  })

  it('hasMore=true 时继续拉下一页', async () => {
    await login()
    const t = fake({ pages: [
      { records: [], nextSince: 10, hasMore: true },
      { records: [], nextSince: 20, hasMore: false },
    ] })
    await syncNow(t)
    expect(t.pulls).toEqual([0, 10])
    expect(await getLastPulledSeq()).toBe(20)
  })

  it('transport 抛错时返回 failed 并记下 lastError（静默，不外泄异常）', async () => {
    await login()
    await enqueuePut('exam', [{ id: 1, date: '2026-07-01', left: 0.6, right: 0.8 }])
    expect(await syncNow(fake({ throwOnPush: true }))).toBe('failed')
    expect(await getMeta(META.lastError)).toBe('network')
  })
})
