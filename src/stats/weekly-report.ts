import type { SessionRow } from '../data/db'
import { weekKey } from './period'
import { addDays } from '../data/date-utils'

export interface WeeklyReport {
  thisWeekCount: number
  lastWeekCount: number
  /** 本周平均反应时间（秒，保留 1 位）；null=本周还没有计时数据 */
  avgReactionSec: number | null
  /** 相比上周：更快/更慢/持平；null=缺一周数据无法比 */
  reactionTrend: 'faster' | 'slower' | 'flat' | null
  /** 本周正确率 0..1；null=本周没答题 */
  accuracy: number | null
  /** 给家长看的一句话建议（含难度进阶提示） */
  suggestion: string
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
export function weeklyReport(sessions: SessionRow[], today: string): WeeklyReport {
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

  let suggestion: string
  if (tw.length === 0) {
    suggestion = '这周还没练，今天开始吧！'
  } else if (accuracy !== null && accuracy >= 0.9) {
    suggestion = '正确率很棒 👍 可以把视标调小一点，挑战更高难度'
  } else if (reactionTrend === 'faster') {
    suggestion = '反应越来越快，调节能力在进步 🎉'
  } else if (accuracy !== null && accuracy < 0.6) {
    suggestion = '正确率偏低——可能视标偏小或需要更专注，家长可陪着看看'
  } else {
    suggestion = '保持每天练习，坚持几周就有效果 💪'
  }

  return {
    thisWeekCount: tw.length,
    lastWeekCount: lw.length,
    avgReactionSec: twReact === null ? null : Math.round(twReact / 100) / 10,
    reactionTrend,
    accuracy,
    suggestion,
  }
}
