import { describe, it, expect } from 'vitest'
import {
  DEFAULT_DURATION_SEC, GOAL_CORRECT_PER_MIN, GOAL_MIN_PER_EYE,
  DURATION_MIN_SEC, DURATION_MAX_SEC, EYES_PER_ROUND, POINTS_CORRECT_CAP_FACTOR,
  sanitizeDurationSec, goalPerEye, goalPerRound, goalForDay, goalForPastDay,
  dayFellShort, shortfall, meetsGoal, pointsCorrect, readDurationSec,
} from './goal'

describe('sanitizeDurationSec', () => {
  it('设置页的四个合法档位原样通过', () => {
    for (const s of [60, 120, 180, 300]) expect(sanitizeDurationSec(s)).toBe(s)
  })

  it('NaN / Infinity / 0 / 负数一律回落到默认 180', () => {
    // fzp.durationSec 是无校验的 localStorage：Number('abc')=NaN、Number('0')=0。
    // 若不钳，NaN 会让所有比较为 false（门槛静默全放行）、0 会让门槛变 0（同样失效）。
    for (const bad of [NaN, Infinity, -Infinity, 0, -5]) {
      expect(sanitizeDurationSec(bad), `脏值 ${bad} 没被兜住`).toBe(DEFAULT_DURATION_SEC)
    }
  })

  it('区间外的正数钳到 [60, 300]（= 设置页四档的上下界）', () => {
    expect(sanitizeDurationSec(30)).toBe(DURATION_MIN_SEC)
    expect(sanitizeDurationSec(9999)).toBe(DURATION_MAX_SEC)
  })
})

describe('goalPerEye / goalPerRound（用户拍板的数值）', () => {
  it('1/2/3/5 分钟 → 单节 5/10/15/25 个', () => {
    expect(goalPerEye(60)).toBe(5)
    expect(goalPerEye(120)).toBe(10)
    expect(goalPerEye(180)).toBe(15)
    expect(goalPerEye(300)).toBe(25)
  })

  it('整次门槛 = 单节 × 2（判定用的就是这个数：一轮 = 左眼一节 + 右眼一节）', () => {
    expect(EYES_PER_ROUND).toBe(2)
    expect(goalPerRound(60)).toBe(10)
    expect(goalPerRound(120)).toBe(20)
    expect(goalPerRound(180)).toBe(30)
    expect(goalPerRound(300)).toBe(50)
  })

  it('脏时长走钳制后的默认值，绝不会算出 0 或 NaN（0 门槛等于全放行）', () => {
    for (const bad of [NaN, 0, -1, Infinity]) {
      expect(goalPerRound(bad), `脏值 ${bad} 让门槛失效了`).toBe(30)
    }
  })

  it('下限兜底：极短时长也至少 GOAL_MIN_PER_EYE', () => {
    expect(goalPerEye(30)).toBe(GOAL_MIN_PER_EYE)
  })

  it('速率常量就是每分钟 5 个——调松紧只改这一处', () => {
    expect(GOAL_CORRECT_PER_MIN).toBe(5)
  })
})

describe('goalForDay：门槛按「当天真实练过的时长」算（堵住事后改档追溯降门槛）', () => {
  it('当天还没练过 → 按当前设置算', () => {
    expect(goalForDay(180, [])).toBe(30)
    expect(goalForDay(60, [])).toBe(10)
  })

  it('5 分钟档练完一轮后把设置改成 1 分钟，当天门槛仍是 50（本条是 blocker 的闸门）', () => {
    // 孩子随手就能点设置页的「1分」：只按当前设置算，就能"练完不达标 → 调小档位 →
    // 门槛从 50 掉到 10 → 已练的答对数照样算 → 下次打卡直接过"。
    expect(goalForDay(60, [300, 300])).toBe(50)
  })

  it('反向也不追溯：家长中途把 1 分改成 5 分，当天已练的 1 分钟节仍按 10 判', () => {
    // 若按当前设置算，门槛会从 10 跳到 50，当天已经练过的轮次全部作废。
    expect(goalForDay(300, [60, 60])).toBe(10)
  })

  it('一天里长短节混着练时按最长那节要求（避免"先长后短"稀释门槛）', () => {
    expect(goalForDay(60, [180, 60])).toBe(30)
  })

  it('脏 elapsedSec（0 / NaN）被忽略，不会把门槛拉低', () => {
    expect(goalForDay(180, [0, NaN, -5])).toBe(30)
    expect(goalForDay(60, [NaN, 300])).toBe(50)
  })

  it('goalForPastDay 只看那天练过的时长，绝不掺入"现在"的设置', () => {
    expect(goalForPastDay([180, 180])).toBe(30)
    expect(goalForPastDay([60])).toBe(10)
  })
})

describe('dayFellShort：补签闸门的判据（"那天确实没练够"，不是"那天有记录"）', () => {
  it('那天压根没练 → false（可补，这才是补签卡的设计意图）', () => {
    expect(dayFellShort(0, [])).toBe(false)
  })

  it('那天练了但没练够 → true（不可补，否则 50 分就能架空门槛）', () => {
    expect(dayFellShort(12, [180, 180])).toBe(true)
  })

  it('那天练够了却没点完成键（没打卡行）→ false，仍可补', () => {
    // saveSession 只在计时走满时落库，所以"有 session 行"其实等价于"完整走完过一节"，
    // 拿它当判据会把最该补的一天（练到 40 个却被收走 iPad）堵掉。
    expect(dayFellShort(40, [180, 180])).toBe(false)
    expect(dayFellShort(30, [180, 180])).toBe(false) // 边界正好在等号上
  })
})

describe('pointsCorrect（发分封顶开关，默认关）', () => {
  it('默认 factor 为 0 = 不封顶，原样返回（现状行为）', () => {
    expect(POINTS_CORRECT_CAP_FACTOR).toBe(0)
    expect(pointsCorrect(69, 30)).toBe(69)
  })

  it('factor > 0 时按 goal × factor 封顶——用于用户拍板要削「先失败再补够多发 63%」时', () => {
    expect(pointsCorrect(69, 30, 6)).toBe(69)   // 未到 180，不动
    expect(pointsCorrect(200, 30, 6)).toBe(180) // 封到 180
  })
})

describe('shortfall / meetsGoal', () => {
  it('达标边界正好在等号上', () => {
    expect(meetsGoal(29, 30)).toBe(false)
    expect(meetsGoal(30, 30)).toBe(true)
    expect(meetsGoal(31, 30)).toBe(true)
  })

  it('shortfall 不为负', () => {
    expect(shortfall(12, 30)).toBe(18)
    expect(shortfall(30, 30)).toBe(0)
    expect(shortfall(45, 30)).toBe(0)
  })

  it('答对数是 NaN 时按最不利处理（不放行、差额=整个门槛）', () => {
    expect(meetsGoal(NaN, 30)).toBe(false)
    expect(shortfall(NaN, 30)).toBe(30)
  })
})

describe('readDurationSec（薄包装）', () => {
  it('localStorage 读不到时回落到默认 180，而不是让门槛变成 NaN', () => {
    // 本仓 vitest 是 environment: 'node'，没有 localStorage → lsGet 内部 try/catch 返回 null。
    // 这条同时覆盖真实的隐私模式 / storage 受限场景：那时门槛绝不能跟着失效。
    expect(readDurationSec()).toBe(DEFAULT_DURATION_SEC)
  })
})
