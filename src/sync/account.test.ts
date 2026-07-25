import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import {
  META, getMeta, setMeta, getAccount, saveAccount, clearAccount,
  getLastPulledSeq, setLastPulledSeq, authErrorKey, registerAccount, mergeDecision,
} from './account'

const ACC = { userId: 'u1', email: 'parent@example.com', token: 'f'.repeat(64), inviteCode: 'ABCDEFGH', isAdmin: true }

beforeEach(async () => {
  await db.syncMeta.clear()
  await db.outbox.clear()
})

describe('syncMeta 读写', () => {
  it('未设置的键返回 null', async () => {
    expect(await getMeta('nope')).toBeNull()
  })

  it('setMeta / getMeta 往返', async () => {
    await setMeta(META.lastSyncedAt, '12345')
    expect(await getMeta(META.lastSyncedAt)).toBe('12345')
  })
})

describe('账号', () => {
  it('没有 token 时 getAccount 返回 null（= 纯本地使用，引擎一个请求都不发）', async () => {
    expect(await getAccount()).toBeNull()
  })

  it('saveAccount → getAccount 往返，isAdmin 布尔正确还原', async () => {
    await saveAccount(ACC)
    expect(await getAccount()).toEqual(ACC)
  })

  it('clearAccount 清掉账号', async () => {
    await saveAccount(ACC)
    await clearAccount()
    expect(await getAccount()).toBeNull()
  })

  it('clearAccount 必须清掉 lastPulledSeq——否则换账号登录会从上一个账号的游标开始拉、漏掉全部历史', async () => {
    await saveAccount(ACC)
    await setLastPulledSeq(500)
    await clearAccount()
    expect(await getLastPulledSeq()).toBe(0)
  })

  it('clearAccount 只清 op=put，**保留墓碑**（墓碑无从重建，清掉就等于永久丢掉删除意图）', async () => {
    // pushAll 是从 7 张表读现存行，重建不出墓碑：本地行已经真删了。
    // 清掉墓碑 → A 删的验光记录永远不在 B 消失；A 重新登录从 seq 0 拉，云端那条正常 payload
    // 会被 mergeRecord(local=null) → put 写回本地，也就是 spec §6.1 明说要防的"被复活"。
    await db.outbox.bulkAdd([
      { uuid: 'checkin:default:2026-07-20', kind: 'checkin', payload: {}, updatedAt: 1, op: 'put' },
      { uuid: 'exam:default:2026-07-01:0.6:0.8', kind: 'exam', payload: { _deleted: true }, updatedAt: 2, op: 'delete' },
    ])
    await clearAccount()
    const left = await db.outbox.toArray()
    expect(left.map((r) => r.op)).toEqual(['delete'])
  })

  it('clearAccount **保留 boundUserId**（换账号检测全靠它，清掉了这道防线就失效）', async () => {
    await saveAccount(ACC)
    await clearAccount()
    expect(await getMeta(META.boundUserId)).toBe('u1')
  })
})

describe('mergeDecision — 什么时候才把本机既有数据并入刚登录的账号', () => {
  const base = { isRegister: false, boundUserId: null as string | null, newUserId: 'u2', localRows: 100 }

  it('注册：一定推（这台设备的数据本来就是这个新账号的）', () => {
    expect(mergeDecision({ ...base, isRegister: true, boundUserId: 'u1' })).toBe('push')
  })

  it('从未绑定过任何账号：推（spec §6.3 的"先离线练了再登录"）', () => {
    expect(mergeDecision(base)).toBe('push')
  })

  it('还是同一个账号（换设备回来 / 重新登录）：推', () => {
    expect(mergeDecision({ ...base, boundUserId: 'u2' })).toBe('push')
  })

  it('换了另一个账号且本机有业务数据：必须先问（默认不并入，防跨账号串账）', () => {
    expect(mergeDecision({ ...base, boundUserId: 'u1' })).toBe('ask')
  })

  it('换了另一个账号但本机是空的：直接推（没有任何数据可串）', () => {
    expect(mergeDecision({ ...base, boundUserId: 'u1', localRows: 0 })).toBe('push')
  })
})

describe('拉取游标', () => {
  it('默认为 0（新设备从头拉）', async () => {
    expect(await getLastPulledSeq()).toBe(0)
  })

  it('脏值降级为 0（宁可重拉一遍，也不能跳过历史）', async () => {
    await setMeta(META.lastPulledSeq, 'abc')
    expect(await getLastPulledSeq()).toBe(0)
  })

  it('setLastPulledSeq 往返', async () => {
    await setLastPulledSeq(42)
    expect(await getLastPulledSeq()).toBe(42)
  })
})

describe('authErrorKey', () => {
  it('把服务端错误码映射成 i18n key', () => {
    expect(authErrorKey('bad_invite_code')).toBe('sync.err.badInvite')
    expect(authErrorKey('email_taken')).toBe('sync.err.emailTaken')
    expect(authErrorKey('bad_credentials')).toBe('sync.err.badCredentials')
    expect(authErrorKey('too_many_requests')).toBe('sync.err.tooMany')
    expect(authErrorKey('invite_quota_exhausted')).toBe('sync.err.inviteUsedUp')
  })

  it('未知码兜底为网络错误（服务端将来加码也不会显示空白）', () => {
    expect(authErrorKey('whatever_new_code')).toBe('sync.err.network')
    expect(authErrorKey('')).toBe('sync.err.network')
  })
})

describe('注册 / 登录的测试守卫', () => {
  it('单测环境不发网络、也不白跑 31 万次 PBKDF2', async () => {
    const r = await registerAccount('parent@example.com', 'hunter2', 'ABCDEFGH')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorKey).toBe('sync.err.network')
    expect(await getAccount()).toBeNull()
  })
})
