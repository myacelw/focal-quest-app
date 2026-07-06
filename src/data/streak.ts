import { isYesterday } from './date-utils'

export interface LastCheckin {
  date: string
  streak: number
}

/** 今天打卡后的新 streak */
export function nextStreak(last: LastCheckin | null, todayStr: string): number {
  if (!last) return 1
  if (last.date === todayStr) return last.streak
  if (isYesterday(last.date, todayStr)) return last.streak + 1
  return 1
}

/** 当前有效 streak（显示用，可能尚未打卡） */
export function currentStreak(last: LastCheckin | null, todayStr: string): number {
  if (!last) return 0
  if (last.date === todayStr || isYesterday(last.date, todayStr)) return last.streak
  return 0
}
