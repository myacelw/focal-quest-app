import { addDays } from '../data/date-utils'

/** 该周周一日期（周一起始） */
export function weekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=周日, 1=周一, ...
  const offset = -((day + 6) % 7) // 周日→-6, 周一→0, 周二→-1, ...
  return addDays(dateStr, offset)
}

/** YYYY-MM */
export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}
