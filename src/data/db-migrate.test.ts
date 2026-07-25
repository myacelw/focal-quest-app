import { describe, it, expect, beforeAll } from 'vitest'
import Dexie from 'dexie'
import { FocalQuestDB } from './db'
import { dateStrToMs } from '../sync/migrate-fields'

/** 升级前那台真机的 schema（与 db.ts 里 version(5) 逐字一致） */
const V5_SCHEMA = {
  sessions: '++id, date',
  checkins: 'date',
  badges: 'id',
  monsters: 'id',
  rewards: '++id',
  redemptions: '++id, kind, status',
  exams: '++id, date',
}

/** 建一个 v5 库并塞进"用户既有数据"，模拟升级前的设备 */
async function seedV5(name: string): Promise<void> {
  const legacy = new Dexie(name)
  legacy.version(5).stores(V5_SCHEMA)
  await legacy.open()
  await legacy.table('sessions').bulkAdd([
    { date: '2026-07-20', startedAtMs: 1_700_000_000_000, eye: 'left', answered: 12, correct: 10, flips: 10, elapsedSec: 180, acuity: 0.8 },
    { date: '2026-07-20', startedAtMs: 1_700_000_200_000, eye: 'right', answered: 11, correct: 9, flips: 9, elapsedSec: 180, acuity: 0.8 },
  ])
  await legacy.table('checkins').bulkAdd([{ date: '2026-07-20', streak: 1, dailyPoints: 125, totalPoints: 125 }])
  await legacy.table('badges').bulkAdd([{ id: 'first-session', unlockedAt: 1_700_000_300_000 }])
  await legacy.table('monsters').bulkAdd([{ id: 'sp-ufo', capturedAt: 1_700_000_400_000, source: 'daily' }])
  await legacy.table('rewards').bulkAdd([{ title: '看动画片', cost: 200, active: true, createdAt: 1_700_000_500_000 }])
  await legacy.table('redemptions').bulkAdd([
    { kind: 'reward', title: '看动画片', cost: 200, createdAt: 1_700_000_600_000, createdDate: '2026-07-20', status: 'pending' },
  ])
  await legacy.table('exams').bulkAdd([{ date: '2026-07-01', left: 0.6, right: 0.8, note: '医院复查' }])
  legacy.close()
}

const NAME = 'focalquest-mig-v5'
let up: FocalQuestDB

beforeAll(async () => {
  await seedV5(NAME)
  up = new FocalQuestDB(NAME) // 打开即触发 v5→v6 upgrade
  await up.open()
})

describe('v5 → v6 存量数据迁移', () => {
  it('7 表行数不变，业务字段原值不动（迁移只加字段，不动数据）', async () => {
    expect(await up.sessions.count()).toBe(2)
    expect(await up.checkins.count()).toBe(1)
    expect(await up.badges.count()).toBe(1)
    expect(await up.monsters.count()).toBe(1)
    expect(await up.rewards.count()).toBe(1)
    expect(await up.redemptions.count()).toBe(1)
    expect(await up.exams.count()).toBe(1)

    const ck = await up.checkins.get('2026-07-20')
    expect(ck?.totalPoints).toBe(125)
    const exam = (await up.exams.toArray())[0]
    expect(exam.left).toBe(0.6)
    expect(exam.note).toBe('医院复查')
  })

  it('每一行都拿到了 uuid / updatedAt / profileId', async () => {
    const all = [
      ...(await up.sessions.toArray()), ...(await up.checkins.toArray()), ...(await up.badges.toArray()),
      ...(await up.monsters.toArray()), ...(await up.rewards.toArray()), ...(await up.redemptions.toArray()),
      ...(await up.exams.toArray()),
    ]
    expect(all.length).toBe(8)
    for (const row of all) {
      expect(typeof row.uuid).toBe('string')
      expect(row.uuid!.length).toBeGreaterThan(0)
      expect(typeof row.updatedAt).toBe('number')
      expect(row.profileId).toBe('default')
    }
  })

  it('KEYED 表的 uuid 是确定性派生（两台设备算出同一个值，天然去重）', async () => {
    expect((await up.checkins.get('2026-07-20'))?.uuid).toBe('checkin:default:2026-07-20')
    expect((await up.badges.get('first-session'))?.uuid).toBe('badge:default:first-session')
    expect((await up.monsters.get('sp-ufo'))?.uuid).toBe('monster:default:sp-ufo')
  })

  it('自增主键表的 uuid 也是确定性派生（用行内写入时刻，不用随机数）且互不相同', async () => {
    // 这一条是"两台设备各自迁移同一份历史后云端只留一行"的根据。
    // 若改成随机 uuid，云端会各留一行 → 另一台 pull 后两行都插进本地 → 当日答对数翻倍 → 积分虚高。
    const sessions = (await up.sessions.toArray()).sort((a, b) => a.startedAtMs - b.startedAtMs)
    expect(sessions.map((s) => s.uuid)).toEqual([
      'session:default:1700000000000:left',
      'session:default:1700000200000:right',
    ])
    expect((await up.rewards.toArray())[0].uuid).toBe('reward:default:1700000500000')
    expect((await up.redemptions.toArray())[0].uuid).toBe('redemption:default:1700000600000')
    expect((await up.exams.toArray())[0].uuid).toBe('exam:default:2026-07-01:0.6:0.8')
  })

  it('updatedAt 取自行内既有时间戳，而不是迁移时刻', async () => {
    // 关键：两台设备迁移时刻不同，若取 Date.now() 会让后迁移的那台 LWW 赢下全部历史
    const sessions = await up.sessions.toArray()
    expect(sessions.map((s) => s.updatedAt).sort()).toEqual([1_700_000_000_000, 1_700_000_200_000])
    expect((await up.badges.get('first-session'))?.updatedAt).toBe(1_700_000_300_000)
    expect((await up.monsters.get('sp-ufo'))?.updatedAt).toBe(1_700_000_400_000)
    expect((await up.rewards.toArray())[0].updatedAt).toBe(1_700_000_500_000)
    expect((await up.redemptions.toArray())[0].updatedAt).toBe(1_700_000_600_000)
    expect((await up.checkins.get('2026-07-20'))?.updatedAt).toBe(dateStrToMs('2026-07-20'))
    expect((await up.exams.toArray())[0].updatedAt).toBe(dateStrToMs('2026-07-01'))
  })

  it('新增 outbox / syncMeta 两表存在且为空（迁移本身不产生推送）', async () => {
    expect(up.tables.map((t) => t.name)).toContain('outbox')
    expect(up.tables.map((t) => t.name)).toContain('syncMeta')
    expect(await up.outbox.count()).toBe(0)
    expect(await up.syncMeta.count()).toBe(0)
  })

  it('uuid 索引可用（同步引擎按 uuid 找本地行全靠它）', async () => {
    const one = (await up.sessions.toArray())[0]
    const found = await up.sessions.where('uuid').equals(one.uuid!).first()
    expect(found?.startedAtMs).toBe(one.startedAtMs)
  })
})

describe('全新安装', () => {
  it('没有 v5 数据时直接建到 v6，9 张表齐全且全空（Dexie 不跑 upgrade）', async () => {
    const fresh = new FocalQuestDB('focalquest-fresh-v6')
    await fresh.open()
    expect(fresh.verno).toBe(6)
    expect(fresh.tables.length).toBe(9)
    expect(await fresh.sessions.count()).toBe(0)
    expect(await fresh.outbox.count()).toBe(0)
    fresh.close()
  })
})
