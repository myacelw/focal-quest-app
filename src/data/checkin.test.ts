import { describe, it, expect, beforeEach } from 'vitest'
import { db, type SessionRow } from './db'
import { doCheckIn, getHomeStats } from './checkin'

/**
 * 造一条 session 行。参与判定的三个字段：date、correct、**elapsedSec**
 * （门槛的时长基准取"当天真实练过的最长一节"，见 goalForDay）。
 */
function ses(
  date: string,
  correct: number,
  eye: 'left' | 'right' = 'left',
  elapsedSec = 180,
): Omit<SessionRow, 'id'> {
  return {
    date, startedAtMs: 1, eye,
    answered: correct + 2, correct, flips: correct, elapsedSec, acuity: 0.8,
  }
}

/** pushCheckin 是 fire-and-forget（写 outbox），轮询等它落库 */
async function waitFor(fn: () => Promise<boolean>, ms = 2000): Promise<void> {
  const t0 = Date.now()
  for (;;) {
    if (await fn()) return
    if (Date.now() - t0 > ms) throw new Error('等待落库超时')
    await new Promise((r) => setTimeout(r, 5))
  }
}

beforeEach(async () => {
  // ⚠️ 先让出一拍再清表。pushCheckin 是 fire-and-forget：fire() → enqueuePut() 会在
  // **一个事务里同时** db.checkins.put(stamped) 和 db.outbox.add(...)。上一条用例的那个
  // 事务若在本次清表之后才提交，就会凭空复活一条今日打卡行——于是"挂机整轮 → below-goal
  // / checkins.count()===0"那条会读到 existing 而返回 'already'，偶发红且报错完全指不到根因。
  // （src/data/api.test.ts 之所以稳，是因为它每条用例都 waitFor 到入队落地才结束。）
  await new Promise((r) => setTimeout(r, 0))
  await Promise.all([db.sessions.clear(), db.checkins.clear(), db.outbox.clear()])
})

describe('doCheckIn：达标才打卡', () => {
  it('当天累计答对达到整次门槛 → checked-in，写 checkins 并发分', async () => {
    await db.sessions.add(ses('2026-07-27', 16))
    await db.sessions.add(ses('2026-07-27', 14, 'right'))
    const r = await doCheckIn('2026-07-27', 180)
    expect(r.outcome).toBe('checked-in')
    expect(r.goal).toBe(30)
    expect(r.correctToday).toBe(30)
    expect(r.streak).toBe(1)
    expect(r.dailyPoints).toBe(180) // floor((30*5 + 30) * 1.0)
    expect(await db.checkins.count()).toBe(1)
    // 入队落地后再结束本条，否则它的事务会漏到下一条用例清表之后（见 beforeEach 注释）
    await waitFor(async () => (await db.outbox.where('kind').equals('checkin').count()) >= 1)
  })

  it('挂机整轮（答对 0 个）→ below-goal，不写 checkins（这就是本功能要堵的漏洞）', async () => {
    await db.sessions.add(ses('2026-07-27', 0))
    await db.sessions.add(ses('2026-07-27', 0, 'right'))
    const r = await doCheckIn('2026-07-27', 180)
    expect(r.outcome).toBe('below-goal')
    expect(r.correctToday).toBe(0)
    expect(r.goal).toBe(30)
    expect(await db.checkins.count()).toBe(0)
  })

  it('差一个也不放行，正好够就放行（边界在等号上）', async () => {
    await db.sessions.add(ses('2026-07-27', 29))
    expect((await doCheckIn('2026-07-27', 180)).outcome).toBe('below-goal')
    await db.sessions.add(ses('2026-07-27', 1, 'right'))
    expect((await doCheckIn('2026-07-27', 180)).outcome).toBe('checked-in')
    await waitFor(async () => (await db.outbox.where('kind').equals('checkin').count()) >= 1)
  })

  it('门槛按时长比例：1 分钟档只要 10 个', async () => {
    // elapsedSec 也要给 60——门槛的时长基准取"当天真实练过的最长一节"，
    // 若这里仍留默认 180，门槛会按 3 分钟档算成 30。
    await db.sessions.add(ses('2026-07-27', 9, 'left', 60))
    expect((await doCheckIn('2026-07-27', 60)).goal).toBe(10)
    expect((await doCheckIn('2026-07-27', 60)).outcome).toBe('below-goal')
    await db.sessions.add(ses('2026-07-27', 1, 'right', 60))
    expect((await doCheckIn('2026-07-27', 60)).outcome).toBe('checked-in')
    await waitFor(async () => (await db.outbox.where('kind').equals('checkin').count()) >= 1)
  })

  it('【blocker 闸门】5 分钟档练完一轮后把设置改成 1 分钟，当天门槛仍是 50', async () => {
    // 不修的话：练完只拿到 12 个（门槛 50）→ 孩子点一下设置页「1分」→ 门槛变 10 →
    // 那 12 个照样算 → 下一次 doCheckIn 直接打卡成功。设置页就在常驻导航里，随手可点。
    await db.sessions.add(ses('2026-07-27', 6, 'left', 300))
    await db.sessions.add(ses('2026-07-27', 6, 'right', 300))
    const r = await doCheckIn('2026-07-27', 60) // ← 已经改成 1 分钟档了
    expect(r.goal, '门槛被事后改档追溯降低了').toBe(50)
    expect(r.outcome).toBe('below-goal')
    expect(await db.checkins.count()).toBe(0)
  })

  it('脏 durationSec 不会让门槛静默失效（NaN + 当天还没练过 → 按默认 180 的门槛 30 算）', async () => {
    // 当天没有 session 行时门槛只能按设置算，所以这条要在零 session 下测才隔离得干净。
    const r = await doCheckIn('2026-07-27', Number('abc'))
    expect(r.goal).toBe(30)
    expect(r.outcome).toBe('below-goal')
    expect(await db.checkins.count()).toBe(0)
  })
})

describe('doCheckIn：不达标时的安全不变式', () => {
  it('dailyPoints 恒为 0、totalPoints 恒等于既有累计（保证皮肤解锁不可能误弹）', async () => {
    await db.checkins.put({ date: '2026-07-20', streak: 3, dailyPoints: 90, totalPoints: 900 })
    await db.sessions.add(ses('2026-07-27', 5))
    const r = await doCheckIn('2026-07-27', 180)
    expect(r.outcome).toBe('below-goal')
    expect(r.dailyPoints).toBe(0)
    expect(r.totalPoints).toBe(900)
    // TrainingPage 的皮肤推导是 prevPoints = totalPoints - dailyPoints，
    // 这个恒等式保证 newlyUnlockedSkins(x, x) 必然返回空数组
    expect(r.totalPoints - r.dailyPoints).toBe(r.totalPoints)
  })

  it('streak 返回的是"还没保住"的连续天数（昨天打过卡 → 原值；更早 → 0）', async () => {
    await db.checkins.put({ date: '2026-07-26', streak: 4, dailyPoints: 90, totalPoints: 900 })
    await db.sessions.add(ses('2026-07-27', 3))
    expect((await doCheckIn('2026-07-27', 180)).streak).toBe(4)

    await db.checkins.clear()
    await db.checkins.put({ date: '2026-07-01', streak: 9, dailyPoints: 90, totalPoints: 900 })
    expect((await doCheckIn('2026-07-27', 180)).streak).toBe(0)
  })

  it('不达标不推云；补够后同一天只推出一条 checkin', async () => {
    await db.sessions.add(ses('2026-07-27', 12))
    expect((await doCheckIn('2026-07-27', 180)).outcome).toBe('below-goal')
    expect(await db.checkins.count()).toBe(0)

    await db.sessions.add(ses('2026-07-27', 20, 'right'))
    expect((await doCheckIn('2026-07-27', 180)).outcome).toBe('checked-in')
    await waitFor(async () => (await db.outbox.where('kind').equals('checkin').count()) === 1)
    // 恰好 1 条 —— 不达标那次一条都没推（pushCheckin 只在 db.checkins.put 之后调用）
    expect(await db.outbox.where('kind').equals('checkin').count()).toBe(1)
  })
})

describe('doCheckIn：一天练两轮与已打卡', () => {
  it('第一轮不达标、再练一轮补够 → 打卡，且发分按当天累计算（与门槛同源）', async () => {
    await db.sessions.add(ses('2026-07-27', 8))
    await db.sessions.add(ses('2026-07-27', 6, 'right'))
    expect((await doCheckIn('2026-07-27', 180)).outcome).toBe('below-goal')

    await db.sessions.add(ses('2026-07-27', 10))
    await db.sessions.add(ses('2026-07-27', 12, 'right'))
    const r = await doCheckIn('2026-07-27', 180)
    expect(r.outcome).toBe('checked-in')
    expect(r.correctToday).toBe(36)
    expect(r.dailyPoints).toBe(210) // floor((36*5 + 30) * 1.0)
    await waitFor(async () => (await db.outbox.where('kind').equals('checkin').count()) >= 1)
  })

  it('【锚定发分不对称】"先失败再补够"比"第一轮就达标"多发 63%——这是本次改动新引入的，别当 bug 优化掉', async () => {
    // 现状（POINTS_CORRECT_CAP_FACTOR = 0，不封顶）刻意保留，理由与代价见 spec §4.3
    // 与计划 Step 0.6：要吃到这个差价必须先坐满 6 分钟故意不答、再认真练 6 分钟。
    // 若用户拍板要削，只改 goal.ts 的 POINTS_CORRECT_CAP_FACTOR（取 6，**不要取 2**），
    // 然后把下面第二个断言改成 floor(min(69,180)*5+30) —— 绝不许去改 reconcile.ts。
    await db.sessions.add(ses('2026-07-27', 40))
    expect((await doCheckIn('2026-07-27', 180)).dailyPoints).toBe(230) // 第一轮就达标：只按 40 结算
    await waitFor(async () => (await db.outbox.where('kind').equals('checkin').count()) >= 1)

    await db.checkins.clear()
    await db.sessions.clear()
    await db.sessions.add(ses('2026-07-28', 29))            // 第一轮压着停在 29（差 1 个）
    expect((await doCheckIn('2026-07-28', 180)).outcome).toBe('below-goal')
    await db.sessions.add(ses('2026-07-28', 40, 'right'))   // 第二轮认真练
    expect((await doCheckIn('2026-07-28', 180)).dailyPoints).toBe(375) // 按当天累计 69 结算
    await waitFor(async () => (await db.outbox.where('kind').equals('checkin').count()) >= 1)
  })

  it('今天已打过卡 → already，门槛不参与（否则会把到手的连续天数吓没）', async () => {
    await db.checkins.put({ date: '2026-07-27', streak: 5, dailyPoints: 120, totalPoints: 1200 })
    await db.sessions.add(ses('2026-07-27', 1)) // 远低于门槛
    const r = await doCheckIn('2026-07-27', 180)
    expect(r.outcome).toBe('already')
    expect(r.streak).toBe(5)
    expect(r.dailyPoints).toBe(120)
    expect(r.totalPoints).toBe(1200)
  })
})

describe('getHomeStats', () => {
  it('带回当天答对数与当天门槛（首页第三态"练了但没练够"靠它）', async () => {
    await db.sessions.add(ses('2026-07-27', 7))
    const s = await getHomeStats('2026-07-27', 180)
    expect(s.checkedInToday).toBe(false)
    expect(s.correctToday).toBe(7)
    expect(s.goalToday).toBe(30)
  })

  it('durationSec 缺省时按默认 180 算门槛（既有 3 个调用点不必改）', async () => {
    const s = await getHomeStats('2026-07-27')
    expect(s.goalToday).toBe(30)
    expect(s.correctToday).toBe(0)
  })

  it('goalToday 与 doCheckIn 一个算法：练过 5 分钟节后改成 1 分钟档，首页显示的门槛仍是 50', async () => {
    // 两处算法若不同源，首页会显示"练了 12/10 还没完成"这种自相矛盾的话。
    await db.sessions.add(ses('2026-07-27', 12, 'left', 300))
    const s = await getHomeStats('2026-07-27', 60)
    expect(s.goalToday).toBe(50)
    expect(s.correctToday).toBe(12)
  })
})
