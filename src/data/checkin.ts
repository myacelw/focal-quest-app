import { db, type SessionRow, type CheckinRow } from './db'
import { nextStreak, currentStreak, type LastCheckin } from './streak'
import { dailyPoints } from './points'
import { pushSession, pushCheckin } from './api'
import { goalForDay, goalPerRound, meetsGoal, pointsCorrect, DEFAULT_DURATION_SEC } from '../training/goal'

export async function saveSession(row: Omit<SessionRow, 'id'>): Promise<void> {
  const id = await db.sessions.add(row)
  pushSession({ ...row, id })
}

/**
 * 打卡三态。刻意不用布尔——"今天已打过"与"答对太少"是两种完全不同的结果，
 * 用两个布尔字段迟早会出现互相矛盾的组合。
 */
export type CheckinOutcome = 'checked-in' | 'already' | 'below-goal'

export interface CheckinResult {
  outcome: CheckinOutcome
  /** 当天累计答对（全部 sessions 求和），与 dailyPoints 的取数完全同源 */
  correctToday: number
  /** 当天整次门槛 */
  goal: number
  streak: number
  dailyPoints: number
  totalPoints: number
}

/**
 * 完成一轮训练后打卡。today = 本地 YYYY-MM-DD；durationSec = 刚练完那一节的实际时长。
 *
 * 判定顺序是硬口径（spec §4.3）：**already → below-goal → checked-in**。
 * "今天已打过卡"必须先短路——否则"第一轮达标已打卡、第二轮又练但这次合计不够"
 * 会被门槛误判成打卡失败，把已经到手的连续天数吓没。
 *
 * 门槛判的是"有没有真练"，判据是**当天全部 sessions 的答对数之和**，与
 * dailyPoints 同源。所以"再练一轮补够"是天然成立的（结算页那个重来按钮的基础）。
 *
 * ⚠️ durationSec 只是**兜底基准**：门槛的时长走 goalForDay(当天各节 elapsedSec)，
 * 当天练过就按最长那节算。否则孩子练完不达标后去设置页点一下「1分」，门槛会从 30
 * 掉到 10、已练的答对数照样算，下一次调用直接打卡成功（spec §3.5）。
 */
export async function doCheckIn(today: string, durationSec: number): Promise<CheckinResult> {
  const todaySessions = await db.sessions.where('date').equals(today).toArray()
  const correctToday = todaySessions.reduce((sum, r) => sum + r.correct, 0)
  const goal = goalForDay(durationSec, todaySessions.map((r) => r.elapsedSec))

  const existing = await db.checkins.get(today)
  if (existing) {
    return {
      outcome: 'already',
      correctToday,
      goal,
      streak: existing.streak,
      dailyPoints: existing.dailyPoints,
      totalPoints: existing.totalPoints,
    }
  }

  const last = await db.checkins.orderBy('date').last()
  const lastCk: LastCheckin | null = last ? { date: last.date, streak: last.streak } : null

  if (!meetsGoal(correctToday, goal)) {
    // 不写 checkins → 天然不推云（pushCheckin 只在 put 之后调用）。
    // dailyPoints 恒 0 且 totalPoints 恒等于既有累计：这个不变式让调用方即使
    // 误走皮肤解锁推导（prevPoints = totalPoints - dailyPoints）也拿到相等的两个数，
    // newlyUnlockedSkins 必然返回空数组，不可能误弹「解锁新皮肤」。
    return {
      outcome: 'below-goal',
      correctToday,
      goal,
      // 用 currentStreak 而非 nextStreak：它表达的是"**还没保住**的连续天数"，
      // 正好驱动结算页那句「连续 N 天还没保住，今天再练一轮就能接上」。
      streak: currentStreak(lastCk, today),
      dailyPoints: 0,
      totalPoints: last ? last.totalPoints : 0,
    }
  }

  const streak = nextStreak(lastCk, today)
  // pointsCorrect 默认（POINTS_CORRECT_CAP_FACTOR = 0）原样返回 correctToday，
  // 即发分行为与改动前完全一致。它是"先失败再补够多发 63%"那条不对称的止损阀门，
  // 开不开由用户拍板（spec §4.3）。⚠️ 只在这里首次结算时封顶，
  // src/sync/reconcile.ts 的"dailyPoints 一律沿用行内原值"一个字都不能动。
  const dp = dailyPoints(pointsCorrect(correctToday, goal), streak)
  const totalPoints = (last ? last.totalPoints : 0) + dp

  const row: CheckinRow = { date: today, streak, dailyPoints: dp, totalPoints }
  await db.checkins.put(row)
  pushCheckin(row)
  return { outcome: 'checked-in', correctToday, goal, streak, dailyPoints: dp, totalPoints }
}

export interface HomeStats {
  checkedInToday: boolean
  streak: number
  totalPoints: number
  /** 当天累计答对，驱动首页"练了但没练够"第三态 */
  correctToday: number
  /** 当天整次门槛 */
  goalToday: number
}

/**
 * durationSec 可选：只有首页需要显示准确门槛才传，SettingsPage / TrainingPage /
 * ChallengePage 三处既有调用只用 totalPoints / checkedInToday，一字不改。
 */
export async function getHomeStats(
  today: string,
  durationSec: number = DEFAULT_DURATION_SEC,
): Promise<HomeStats> {
  try {
    const last = await db.checkins.orderBy('date').last()
    const todaySessions = await db.sessions.where('date').equals(today).toArray()
    const lastCk: LastCheckin | null = last ? { date: last.date, streak: last.streak } : null
    return {
      checkedInToday: last?.date === today,
      streak: currentStreak(lastCk, today),
      totalPoints: last ? last.totalPoints : 0,
      correctToday: todaySessions.reduce((sum, r) => sum + r.correct, 0),
      // 与 doCheckIn 同一个算法（goalForDay）：两处若不同源，首页会显示
      // "练了 12/10 还没完成"这种自相矛盾的话
      goalToday: goalForDay(durationSec, todaySessions.map((r) => r.elapsedSec)),
    }
  } catch {
    // IndexedDB 不可用（隐私模式/storage 受限）时降级，不崩。
    // 拿不到 sessions，只能退回按设置算门槛。
    return {
      checkedInToday: false, streak: 0, totalPoints: 0,
      correctToday: 0, goalToday: goalPerRound(durationSec),
    }
  }
}
