import { describe, it, expect } from 'vitest'
import { syncFieldsFor, dateStrToMs } from './migrate-fields'

const FIXED = () => 'fixed-uuid'

describe('dateStrToMs', () => {
  it("把 'YYYY-MM-DD' 折算成 UTC 零点毫秒", () => {
    expect(dateStrToMs('2026-07-20')).toBe(Date.parse('2026-07-20T00:00:00Z'))
  })

  it('对非日期字符串 / 非字符串返回 null', () => {
    expect(dateStrToMs('2026-7-20')).toBeNull()
    expect(dateStrToMs('hello')).toBeNull()
    expect(dateStrToMs(123)).toBeNull()
    expect(dateStrToMs(undefined)).toBeNull()
  })
})

describe('syncFieldsFor — 每类记录的时间戳来源', () => {
  it('checkin：uuid 由 date 确定性派生，updatedAt 由 date 折算', () => {
    const f = syncFieldsFor('checkin', { date: '2026-07-20', streak: 1 }, 999, FIXED)
    expect(f.uuid).toBe('checkin:default:2026-07-20')
    expect(f.updatedAt).toBe(Date.parse('2026-07-20T00:00:00Z'))
  })

  it('badge：updatedAt = unlockedAt', () => {
    expect(syncFieldsFor('badge', { id: 'streak-7', unlockedAt: 1234 }, 999, FIXED).updatedAt).toBe(1234)
  })

  it('monster：updatedAt = capturedAt', () => {
    expect(syncFieldsFor('monster', { id: 'sp-ufo', capturedAt: 4321 }, 999, FIXED).updatedAt).toBe(4321)
  })

  it('session：updatedAt = startedAtMs，uuid 由 startedAtMs+eye 确定性派生（不用随机）', () => {
    const f = syncFieldsFor('session', { id: 3, date: '2026-07-20', startedAtMs: 5555, eye: 'left' }, 999, FIXED)
    expect(f.updatedAt).toBe(5555)
    // 两台设备各自迁移同一条历史必须算出同一个 uuid，否则云端会各留一行、当日答对数翻倍
    expect(f.uuid).toBe('session:default:5555:left')
  })

  it('reward：updatedAt = createdAt', () => {
    expect(syncFieldsFor('reward', { id: 1, createdAt: 777 }, 999, FIXED).updatedAt).toBe(777)
  })

  it('redemption：updatedAt = createdAt', () => {
    expect(syncFieldsFor('redemption', { id: 1, createdAt: 888 }, 999, FIXED).updatedAt).toBe(888)
  })

  it('exam：updatedAt 由 date 折算（验光记录只有日期）', () => {
    expect(syncFieldsFor('exam', { id: 1, date: '2026-07-01', left: 0.6, right: 0.8 }, 999, FIXED).updatedAt)
      .toBe(Date.parse('2026-07-01T00:00:00Z'))
  })
})

describe('syncFieldsFor — profileId 与幂等', () => {
  it('profileId 缺省填 default，已有则沿用，且编进 uuid', () => {
    expect(syncFieldsFor('badge', { id: 'a', unlockedAt: 1 }, 999, FIXED).profileId).toBe('default')
    const kid2 = syncFieldsFor('badge', { id: 'a', unlockedAt: 1, profileId: 'kid2' }, 999, FIXED)
    expect(kid2.profileId).toBe('kid2')
    expect(kid2.uuid).toBe('badge:kid2:a')
  })

  it('行内已有 uuid / updatedAt 时一律沿用（重复迁移不改身份、不刷新 LWW 时间）', () => {
    const f = syncFieldsFor('session', { id: 3, startedAtMs: 5555, eye: 'left', uuid: 'keep', updatedAt: 42 }, 999, FIXED)
    expect(f.uuid).toBe('keep')
    expect(f.updatedAt).toBe(42)
  })

  it('时间字段缺失或损坏时退回 fallbackMs，自然键缺失时退回注入的 newId（脏数据不产生 NaN，也不撞车）', () => {
    expect(syncFieldsFor('badge', { id: 'a' }, 999, FIXED).updatedAt).toBe(999)
    expect(syncFieldsFor('session', { id: 1, startedAtMs: NaN }, 999, FIXED).updatedAt).toBe(999)
    expect(syncFieldsFor('checkin', { date: 'x' }, 999, FIXED).updatedAt).toBe(999)
    expect(syncFieldsFor('session', { id: 1 }, 999, FIXED).uuid).toBe('fixed-uuid')
  })
})
