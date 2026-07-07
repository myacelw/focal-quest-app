import type { SessionRow } from '../data/db'
import { cpm } from '../training/cpm'
import { weekKey, monthKey } from './period'

export type Dim = 'day' | 'week' | 'month'

export interface PeriodStat {
  label: string
  count: number
  totalSec: number
  avgCpm: number
  avgAccuracy: number
}

function keyOf(date: string, dim: Dim): string {
  if (dim === 'week') return weekKey(date)
  if (dim === 'month') return monthKey(date)
  return date
}

export function aggregate(sessions: SessionRow[], dim: Dim): PeriodStat[] {
  const groups = new Map<string, SessionRow[]>()
  for (const s of sessions) {
    const k = keyOf(s.date, dim)
    const arr = groups.get(k)
    if (arr) arr.push(s)
    else groups.set(k, [s])
  }

  const stats: PeriodStat[] = []
  for (const [label, rows] of groups) {
    const totalSec = rows.reduce((a, r) => a + r.elapsedSec, 0)
    const totalFlips = rows.reduce((a, r) => a + r.flips, 0)
    const totalCorrect = rows.reduce((a, r) => a + r.correct, 0)
    const totalAnswered = rows.reduce((a, r) => a + r.answered, 0)
    stats.push({
      label,
      count: rows.length,
      totalSec,
      avgCpm: cpm(totalFlips, totalSec),
      avgAccuracy: totalAnswered === 0 ? 0 : totalCorrect / totalAnswered,
    })
  }
  stats.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
  return stats
}
