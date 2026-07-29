import { describe, it, expect } from 'vitest'
import {
  ADMIN_DAYS, RECENT_DAYS, windowStartMs, dateList, tzDate, isAbuseMetric,
  fillDailyCounts, fillKindCounts, sumAbuse, shapeAdminStats,
  type RawAdminStats,
} from './admin-stats'
// 条数与顺序一律从 KINDS 派生，别再写死数字——加一种 kind 时写死的断言会在这里绊一跤
import { KINDS } from './sync-validate'

const DAY = 86_400_000
// 固定一个时刻做基准：2026-07-26T10:30:00Z = 北京时间 18:30，同一天
const NOW = Date.UTC(2026, 6, 26, 10, 30, 0)

// adminGate 的三条鉴权锚点已随函数搬到 functions/lib/auth.test.ts

describe('windowStartMs', () => {
  it('days=1 对齐到今天的东八区零点（= 前一天 16:00Z）', () => {
    expect(windowStartMs(NOW, 1)).toBe(Date.UTC(2026, 6, 25, 16, 0))
  })

  it('days=7 是"含今天的近 7 个东八区日"的起点', () => {
    expect(windowStartMs(NOW, 7)).toBe(Date.UTC(2026, 6, 19, 16, 0))
  })

  it('days=30 会跨月（6 月 27 日的东八区零点）', () => {
    expect(windowStartMs(NOW, 30)).toBe(Date.UTC(2026, 5, 26, 16, 0))
  })
})

describe('tzDate（东八区日界，不是 UTC）', () => {
  it('北京时间 07:30（= 23:30Z 前一天）算前一天，08:30 才算今天——这正是不用 UTC 的原因', () => {
    expect(tzDate(Date.UTC(2026, 6, 25, 23, 30))).toBe('2026-07-26') // 北京 7/26 07:30
    expect(tzDate(Date.UTC(2026, 6, 26, 0, 30))).toBe('2026-07-26')  // 北京 7/26 08:30
    expect(tzDate(Date.UTC(2026, 6, 25, 15, 30))).toBe('2026-07-25') // 北京 7/25 23:30
  })

  it('日界恰好在 16:00Z：15:59:59Z 是前一天，16:00:00Z 是新一天', () => {
    expect(tzDate(Date.UTC(2026, 6, 25, 15, 59, 59))).toBe('2026-07-25')
    expect(tzDate(Date.UTC(2026, 6, 25, 16, 0, 0))).toBe('2026-07-26')
  })
})

describe('dateList', () => {
  it('返回升序日期串，末位是今天、长度等于 days', () => {
    const list = dateList(NOW, 30)
    expect(list.length).toBe(30)
    expect(list[29]).toBe('2026-07-26')
    expect(list[0]).toBe('2026-06-27')
  })

  it('days=1 只有今天', () => {
    expect(dateList(NOW, 1)).toEqual(['2026-07-26'])
  })

  it('跨月处相邻两天连续（不会漏掉月末那天）', () => {
    const list = dateList(Date.UTC(2026, 7, 2, 1, 0), 4)
    expect(list).toEqual(['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'])
  })
})

describe('isAbuseMetric', () => {
  it('业务计数保留（现有全部 metric 都要过）', () => {
    for (const m of [
      'register.ok', 'register.badcode', 'register.ratelimit', 'register.quotaexhausted',
      'login.ok', 'login.fail', 'login.ratelimit', 'push.ok', 'active.user',
      'push.reject.bad_kind', 'push.reject.bad_updated_at', 'push.reject.payload_too_large',
    ]) expect(isAbuseMetric(m), m).toBe(true)
  })

  it('rl.* 一律排除——那是内部限速桶，metric 里编着 IP 与邮箱，绝不能出现在界面上', () => {
    expect(isAbuseMetric('rl.login.parent@example.com.1.2.3.4.487000')).toBe(false)
    expect(isAbuseMetric('rl.reg.fail.1.2.3.4.487000')).toBe(false)
  })

  it('形状白名单：任何含 @ 或含纯数字段的 metric 都挡住（黑名单挡不住将来新加的 login.byip.<ip>）', () => {
    // 界面对未知 metric 的默认行为是"原样上屏"，所以这道防线必须是白名单而不是黑名单
    expect(isAbuseMetric('login.byip.1.2.3.4')).toBe(false)
    expect(isAbuseMetric('login.byemail.a@b.com')).toBe(false)
    expect(isAbuseMetric('Register.OK')).toBe(false)
    expect(isAbuseMetric('')).toBe(false)
  })
})

describe('fillDailyCounts', () => {
  it('缺的日子补 0，且长度与顺序由窗口决定（曲线不能因为没人练就断掉）', () => {
    const out = fillDailyCounts([{ date: '2026-07-26', count: 3 }], NOW, 3)
    expect(out).toEqual([
      { date: '2026-07-24', count: 0 },
      { date: '2026-07-25', count: 0 },
      { date: '2026-07-26', count: 3 },
    ])
  })

  it('按日期升序输出，与 SQL 返回顺序无关', () => {
    const out = fillDailyCounts(
      [{ date: '2026-07-26', count: 1 }, { date: '2026-07-24', count: 2 }],
      NOW, 3,
    )
    expect(out.map((d) => d.date)).toEqual(['2026-07-24', '2026-07-25', '2026-07-26'])
    expect(out.map((d) => d.count)).toEqual([2, 0, 1])
  })

  it('窗口外的行被丢弃（不会把半年前的一天挤进 30 天曲线）', () => {
    const out = fillDailyCounts([{ date: '2020-01-01', count: 99 }], NOW, 3)
    expect(out.every((d) => d.count === 0)).toBe(true)
  })
})

describe('fillKindCounts', () => {
  it('已知的每一类都出现且顺序 = KINDS（缺的补 0，界面不会时多时少地跳）', () => {
    const out = fillKindCounts([
      { kind: 'session', count: 5, recent: 2 },
      { kind: 'exam', count: 2, recent: 0 },
    ])
    expect(out.map((k) => k.kind)).toEqual([...KINDS])
    // 只有传进去的两类有值，其余补 0；位置按 KINDS 的顺序
    const expected = KINDS.map((k) => (k === 'session' ? 5 : k === 'exam' ? 2 : 0))
    expect(out.map((k) => k.count)).toEqual(expected)
  })

  // spec §8 第一条指标要的是"各 kind 记录量**与增速**"：只给累计量看不出 checkin/badge/
  // monster/reward/redemption/exam 这 6 类在不在长（30 天曲线只覆盖 session）。
  it('recent（近 RECENT_DAYS 天新增）随 count 一起透传，缺的一并补 0', () => {
    const out = fillKindCounts([{ kind: 'session', count: 5, recent: 2 }])
    expect(out[0]).toEqual({ kind: 'session', count: 5, recent: 2 })
    expect(out[1]).toEqual({ kind: 'checkin', count: 0, recent: 0 })
    expect(RECENT_DAYS).toBe(7)
  })

  it('未知 kind 追加在末尾（将来加了新表、后台先看见它，而不是静默丢掉）', () => {
    const out = fillKindCounts([{ kind: 'profile', count: 1, recent: 1 }])
    expect(out.length).toBe(KINDS.length + 1)
    expect(out[KINDS.length]).toEqual({ kind: 'profile', count: 1, recent: 1 })
  })

  it('空输入也给出每类一个 0（count 与 recent 都是 0）', () => {
    const out = fillKindCounts([])
    const zeros = KINDS.map(() => 0)
    expect(out.map((k) => k.count)).toEqual(zeros)
    expect(out.map((k) => k.recent)).toEqual(zeros)
  })
})

describe('sumAbuse', () => {
  it('同一 metric 跨日累加', () => {
    const out = sumAbuse([
      { metric: 'login.fail', value: 2 },
      { metric: 'login.fail', value: 3 },
    ])
    expect(out).toEqual([{ metric: 'login.fail', total: 5 }])
  })

  it('排除 rl.*（第二道防线：SQL 那道漏了这里也拦住）', () => {
    const out = sumAbuse([
      { metric: 'rl.login.a@b.com.1.1.1.1.487000', value: 9 },
      { metric: 'login.ok', value: 1 },
    ])
    expect(out).toEqual([{ metric: 'login.ok', total: 1 }])
  })

  it('按次数降序、同次数按 metric 名升序（顺序稳定，刷新不乱跳）', () => {
    const out = sumAbuse([
      { metric: 'login.ok', value: 1 },
      { metric: 'register.ok', value: 7 },
      { metric: 'active.user', value: 1 },
    ])
    expect(out.map((r) => r.metric)).toEqual(['register.ok', 'active.user', 'login.ok'])
  })
})

describe('shapeAdminStats', () => {
  const raw: RawAdminStats = {
    userCount: 4,
    activeTokenCount: 6,
    kindRows: [
      { kind: 'session', count: 60, recent: 5 },
      { kind: 'checkin', count: 30, recent: 2 },
    ],
    dailyRows: [{ date: '2026-07-26', count: 4 }],
    sessionUsers: { d1: 1, d7: 2, d30: 3 },
    openUsers: { d1: 2, d7: 3, d30: 4 },
    recentUsers: [{ email: 'a@b.com', createdAt: 1_700_000_000_000, invitedByEmail: null, isAdmin: true }],
    inviters: [{ email: 'a@b.com', invited: 2, quota: 5 }],
    counterRows: [{ metric: 'register.ok', value: 3 }, { metric: 'rl.reg.1.2.3.4.487000', value: 8 }],
  }

  it('装配出完整响应结构', () => {
    const s = shapeAdminStats(raw, NOW)
    expect(s.totals).toEqual({ users: 4, records: 90, tokens: 6 })
    expect(s.active).toEqual({ dau: 1, wau: 2, mau: 3, openDau: 2, openWau: 3, openMau: 4 })
    expect(s.recentUsers[0].invitedByEmail).toBe(null)
    expect(s.inviters[0]).toEqual({ email: 'a@b.com', invited: 2, quota: 5 })
    expect(s.abuse).toEqual([{ metric: 'register.ok', total: 3 }])
  })

  // 省掉一整遍 records 全表扫：D1 免费层 500 万行读/日，而这张表和云同步共用一个 D1，
  // 配额耗尽不是"后台看不了"而是"训练数据同步不上"（见 Architecture 判断 3）。
  it('totals.records 由 kindRows 求和而来，不再单独 COUNT(*) FROM records', () => {
    const s = shapeAdminStats({ ...raw, kindRows: [{ kind: 'exam', count: 7, recent: 1 }] }, NOW)
    expect(s.totals.records).toBe(7)
    expect(shapeAdminStats({ ...raw, kindRows: [] }, NOW).totals.records).toBe(0)
  })

  it('generatedAt 用传入的 nowMs（响应可复现，便于集成测试断言）', () => {
    expect(shapeAdminStats(raw, NOW).generatedAt).toBe(NOW)
  })

  it('daily 恒为 ADMIN_DAYS 天、末位是今天', () => {
    const s = shapeAdminStats(raw, NOW)
    expect(ADMIN_DAYS).toBe(30)
    expect(s.daily.length).toBe(30)
    expect(s.daily[29]).toEqual({ date: '2026-07-26', count: 4 })
  })

  it('30 天窗口的起点比今天早 29 天（口径不是"自然月"）', () => {
    const s = shapeAdminStats(raw, NOW)
    expect(Date.parse(s.daily[29].date + 'T00:00:00Z') - Date.parse(s.daily[0].date + 'T00:00:00Z'))
      .toBe(29 * DAY)
  })
})
