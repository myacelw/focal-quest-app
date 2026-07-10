/** Date → 本地 YYYY-MM-DD（补零） */
export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 对 YYYY-MM-DD 做日期加减（UTC 解析，纯日期算术，无时区漂移） */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** dateStr 是否为 todayStr 的前一天 */
export function isYesterday(dateStr: string, todayStr: string): boolean {
  return addDays(todayStr, -1) === dateStr
}

/** bStr - aStr 的天数差（UTC 解析，纯日期算术，无时区漂移） */
export function daysBetween(aStr: string, bStr: string): number {
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((parse(bStr) - parse(aStr)) / 86400000)
}

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7)
}
