import type { SessionRow, RedemptionRow } from '../data/db'
import { weekKey } from './period'
import { addDays, toDateStr } from '../data/date-utils'
import type { OptotypeAutoState } from '../training/optotype-auto'

export interface WeeklyReport {
  thisWeekCount: number
  lastWeekCount: number
  /** 本周平均反应时间（秒，保留 1 位）；null=本周还没有计时数据 */
  avgReactionSec: number | null
  /** 相比上周：更快/更慢/持平；null=缺一周数据无法比 */
  reactionTrend: 'faster' | 'slower' | 'flat' | null
  /** 本周正确率 0..1；null=本周没答题 */
  accuracy: number | null
  /** 给家长看的一句话建议（含难度进阶提示）的 i18n key，渲染时用 t(`stats.${suggestionKey}`) 翻译 */
  suggestionKey: string
}

function weekOf(sessions: SessionRow[], wk: string): SessionRow[] {
  return sessions.filter((s) => weekKey(s.date) === wk)
}

function avgReactionMs(rows: SessionRow[]): number | null {
  const vals = rows.map((r) => r.avgReactionMs ?? 0).filter((v) => v > 0)
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

/** 生成家长周报：本周概览 + 反应时间趋势 + 一句话建议（难度进阶/鼓励/提醒） */
/**
 * `optoState` 决定高正确率那条建议怎么措辞。默认 'auto' 是为了让既有调用点与测试不变，
 * 但 StatsPage 必须传真实状态——否则开关关掉后周报仍宣称"会自动调小"，而那时什么都不会发生。
 */
export function weeklyReport(
  sessions: SessionRow[], today: string, optoState: OptotypeAutoState = 'auto',
): WeeklyReport {
  const thisWk = weekKey(today)
  const lastWk = weekKey(addDays(today, -7))
  const tw = weekOf(sessions, thisWk)
  const lw = weekOf(sessions, lastWk)

  const twReact = avgReactionMs(tw)
  const lwReact = avgReactionMs(lw)
  let reactionTrend: WeeklyReport['reactionTrend'] = null
  if (twReact !== null && lwReact !== null) {
    const diff = (twReact - lwReact) / lwReact
    reactionTrend = diff < -0.05 ? 'faster' : diff > 0.05 ? 'slower' : 'flat'
  }

  const correct = tw.reduce((a, r) => a + r.correct, 0)
  const answered = tw.reduce((a, r) => a + r.answered, 0)
  const accuracy = answered === 0 ? null : correct / answered

  let suggestionKey: string
  if (tw.length === 0) {
    suggestionKey = 'suggest.noSessions'
  } else if (accuracy !== null && accuracy >= 0.9) {
    // ⚠️ 这条在正确率 ≥90% 就触发，而自动收紧还要求反应 ≤2000ms、冷却已过、未到下限。
    // 所以文案必须是**条件式**的（"再快一些就会自动调小"），不能承诺"会自动调小"——
    // 正确率 92% 但反应 3000ms 时它什么都不会做，写成承诺就是假话。
    suggestionKey =
      optoState === 'floor' ? 'suggest.highAccuracyFloor'
      : optoState === 'manual' ? 'suggest.highAccuracyManual'
      : 'suggest.highAccuracyAuto'
  } else if (reactionTrend === 'faster') {
    suggestionKey = 'suggest.reactionFaster'
  } else if (accuracy !== null && accuracy < 0.6) {
    suggestionKey = 'suggest.lowAccuracy'
  } else {
    suggestionKey = 'suggest.keepGoing'
  }

  return {
    thisWeekCount: tw.length,
    lastWeekCount: lw.length,
    avgReactionSec: twReact === null ? null : Math.round(twReact / 100) / 10,
    reactionTrend,
    accuracy,
    suggestionKey,
  }
}

export interface WeeklyExtras {
  monstersThisWeek: number
  redeemedTitlesThisWeek: string[]
}

/** 周报的"游戏化成果"补充：本周捕获怪兽数 + 本周已兑现奖励名称 */
export function weeklyExtras(
  monsters: { capturedAt: number }[],
  redemptions: RedemptionRow[],
  today: string,
): WeeklyExtras {
  const thisWk = weekKey(today)
  const monstersThisWeek = monsters.filter(
    (m) => weekKey(toDateStr(new Date(m.capturedAt))) === thisWk,
  ).length
  const redeemedTitlesThisWeek = redemptions
    .filter((r) => r.kind === 'reward' && r.status === 'fulfilled' && weekKey(r.createdDate) === thisWk)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((r) => r.title)
  return { monstersThisWeek, redeemedTitlesThisWeek }
}
