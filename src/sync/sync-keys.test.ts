import { describe, it, expect } from 'vitest'
import {
  KINDS, KEYED_KINDS, isKeyedKind, naturalKeyOf, naturalKeyFromUuid,
  deterministicUuid, recordUuid, newUuid, TOMBSTONE, isTombstone, toPayload,
  clampUpdatedAt, MAX_FUTURE_MS,
} from './sync-keys'

const P = 'default'

describe('KINDS', () => {
  it('恰为 8 类，且与服务端白名单逐字一致（functions/lib/sync-validate.ts）', () => {
    expect([...KINDS].sort()).toEqual(['badge', 'card', 'checkin', 'exam', 'monster', 'redemption', 'reward', 'session'])
  })
})

describe('card 的同步身份', () => {
  it('自然键取行内 id，uuid 形如 card:default:pony-7', () => {
    expect(naturalKeyOf('card', { id: 'pony-7' })).toBe('pony-7')
    expect(naturalKeyOf('card', {})).toBeNull()
    expect(recordUuid('card', { id: 'pony-7' }, P)).toBe('card:default:pony-7')
  })

  it('uuid 能反解回卡 id（墓碑要靠它找本地行，所以卡 id 不许含冒号）', () => {
    expect(naturalKeyFromUuid('card:default:pony-7')).toBe('pony-7')
  })
})

describe('KEYED_KINDS — 本地主键就是自然键的四类', () => {
  it('只有 checkin / badge / monster / card；其余四类是 ++id 自增', () => {
    expect([...KEYED_KINDS]).toEqual(['checkin', 'badge', 'monster', 'card'])
    expect(isKeyedKind('checkin')).toBe(true)
    expect(isKeyedKind('card')).toBe(true)
    expect(isKeyedKind('session')).toBe(false)
  })
})

describe('recordUuid — 7 类全都派生确定性 uuid', () => {
  it('checkin 用日期', () => {
    expect(recordUuid('checkin', { date: '2026-07-20', streak: 1 }, P)).toBe('checkin:default:2026-07-20')
  })

  it('badge 用勋章 id', () => {
    expect(recordUuid('badge', { id: 'first-session', unlockedAt: 1 }, P)).toBe('badge:default:first-session')
  })

  it('monster 用怪兽 id', () => {
    expect(recordUuid('monster', { id: 'sp-ufo', capturedAt: 1 }, P)).toBe('monster:default:sp-ufo')
  })

  it('session 用 startedAtMs + eye（自增 id 不能当身份，各设备独立编号）', () => {
    expect(recordUuid('session', { id: 12, startedAtMs: 5555, eye: 'left' }, P)).toBe('session:default:5555:left')
  })

  it('reward / redemption 用 createdAt', () => {
    expect(recordUuid('reward', { id: 1, createdAt: 777 }, P)).toBe('reward:default:777')
    expect(recordUuid('redemption', { id: 2, createdAt: 888 }, P)).toBe('redemption:default:888')
  })

  it('exam 用 date + 双眼视力（ExamRow 没有 createdAt 字段）', () => {
    expect(recordUuid('exam', { id: 3, date: '2026-07-01', left: 0.6, right: 0.8 }, P))
      .toBe('exam:default:2026-07-01:0.6:0.8')
  })

  it('同一行两次调用得到同一 uuid —— 这是两设备天然去重的根据', () => {
    const row = { id: 9, startedAtMs: 5555, eye: 'right' }
    expect(recordUuid('session', row, P)).toBe(recordUuid('session', row, P))
  })

  it('deterministicUuid 是 kind:profileId:key 三段拼接', () => {
    expect(deterministicUuid('badge', 'default', 'streak-7')).toBe('badge:default:streak-7')
  })

  it('profileId 编进 uuid —— 3c 上线后两个孩子同一天打卡不会互相覆盖', () => {
    const row = { date: '2026-07-20' }
    expect(recordUuid('checkin', row, 'kid1')).not.toBe(recordUuid('checkin', row, 'kid2'))
  })
})

describe('recordUuid — 沿用与兜底', () => {
  it('已有 uuid 的行原样沿用，绝不重算', () => {
    // 重算会让同一条本地记录在云端长出第二行孤儿记录
    expect(recordUuid('session', { id: 7, uuid: 'keep-me' }, P)).toBe('keep-me')
  })

  it('自然键字段缺失时退回随机 uuid（可注入 newId 便于测试与迁移复现）', () => {
    // 脏数据不该产生 'session:default:undefined:undefined' 这种会互相撞车的 uuid
    expect(recordUuid('session', { id: 3 }, P, () => 'fixed-id')).toBe('fixed-id')
  })
})

describe('newUuid — 不能直接依赖 crypto.randomUUID', () => {
  it('randomUUID 可用时产出非空字符串', () => {
    expect(newUuid().length).toBeGreaterThan(0)
  })

  it('randomUUID 不存在时降级为 32 位 hex —— iPad 走局域网 IP（非安全上下文）时它就是 undefined', () => {
    // 真机故障模式：http://<局域网IP>:5173 不是安全上下文 → randomUUID undefined →
    // v6 upgrade 抛错 → versionchange 事务回滚 → db.open() 每次都失败 → 白屏
    // 用 defineProperty 而不是 delete + @ts-expect-error：后者在 TS 里是"多余的抑制指令"（TS2578）
    const orig = crypto.randomUUID
    try {
      Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true, writable: true })
      expect(newUuid()).toMatch(/^[0-9a-f]{32}$/)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: orig, configurable: true, writable: true })
    }
  })
})

describe('naturalKeyOf', () => {
  it('自然键缺失或类型不对时返回 null（降级为随机 uuid，不产生 "checkin:default:undefined"）', () => {
    expect(naturalKeyOf('checkin', {})).toBeNull()
    expect(naturalKeyOf('badge', { id: 42 })).toBeNull()
    expect(naturalKeyOf('session', { id: 1 })).toBeNull()
  })
})

describe('naturalKeyFromUuid', () => {
  it('取最后一个 ":" 之后的部分（三段式 uuid 的自然键侧不含冒号）', () => {
    expect(naturalKeyFromUuid('checkin:default:2026-07-20')).toBe('2026-07-20')
    expect(naturalKeyFromUuid('badge:default:streak-7')).toBe('streak-7')
  })
})

describe('墓碑', () => {
  it('TOMBSTONE 就是 { _deleted: true }', () => {
    expect(TOMBSTONE).toEqual({ _deleted: true })
  })

  it('isTombstone 识别墓碑', () => {
    expect(isTombstone({ _deleted: true })).toBe(true)
  })

  it('isTombstone 对普通 payload / null / 非对象为 false', () => {
    expect(isTombstone({ date: '2026-07-20' })).toBe(false)
    expect(isTombstone({ _deleted: false })).toBe(false)
    expect(isTombstone(null)).toBe(false)
    expect(isTombstone('deleted')).toBe(false)
  })
})

describe('toPayload', () => {
  it('剥掉自增主键表的本地 id（那是各设备独立自增的号，带过去会覆盖对面不相干的行）', () => {
    expect(toPayload('session', { id: 12, date: '2026-07-20', correct: 9 })).toEqual({ date: '2026-07-20', correct: 9 })
  })

  it('保留 KEYED 表的主键（date / id 是跨设备一致的语义键）', () => {
    expect(toPayload('checkin', { date: '2026-07-20', streak: 3 })).toEqual({ date: '2026-07-20', streak: 3 })
    expect(toPayload('badge', { id: 'streak-7', unlockedAt: 5 })).toEqual({ id: 'streak-7', unlockedAt: 5 })
  })
})

describe('clampUpdatedAt — 本地时钟保护', () => {
  const NOW = 1_700_000_000_000

  it('正常值（含轻微超前）原样通过', () => {
    expect(clampUpdatedAt(NOW - 1000, NOW)).toBe(NOW - 1000)
    expect(clampUpdatedAt(NOW + 60_000, NOW)).toBe(NOW + 60_000)
  })

  it('超前超过 12 小时的一律钳到当下 —— 否则服务端整批 400、这一批永远发不出去', () => {
    // 服务端 maxClockSkewMs = 24h 且 validatePushRecords 整批全或无：
    // iPad 时间被调快时，这些行会永久卡在队首把整条同步链堵死，而且全程静默。
    expect(clampUpdatedAt(NOW + MAX_FUTURE_MS + 1, NOW)).toBe(NOW)
    expect(clampUpdatedAt(NOW + 30 * 86_400_000, NOW)).toBe(NOW)
  })

  it('脏值（NaN / 0 / 负数）退回当下，不产生 bad_updated_at', () => {
    expect(clampUpdatedAt(NaN, NOW)).toBe(NOW)
    expect(clampUpdatedAt(0, NOW)).toBe(NOW)
    expect(clampUpdatedAt(-5, NOW)).toBe(NOW)
  })
})
