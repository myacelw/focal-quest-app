import { db, type SessionRow, type CheckinRow } from './db'
import { nextStreak, currentStreak, type LastCheckin } from './streak'
import { dailyPoints } from './points'

export async function saveSession(row: Omit<SessionRow, 'id'>): Promise<void> {
  await db.sessions.add(row)
}

export interface CheckinResult {
  alreadyCheckedIn: boolean
  streak: number
  dailyPoints: number
  totalPoints: number
}

/** 完成一轮训练后打卡；今日答对数从 sessions 汇总。today = 本地 YYYY-MM-DD */
export async function doCheckIn(today: string): Promise<CheckinResult> {
  const existing = await db.checkins.get(today)
  if (existing) {
    return {
      alreadyCheckedIn: true,
      streak: existing.streak,
      dailyPoints: existing.dailyPoints,
      totalPoints: existing.totalPoints,
    }
  }
  const todaySessions = await db.sessions.where('date').equals(today).toArray()
  const correctToday = todaySessions.reduce((sum, r) => sum + r.correct, 0)

  const last = await db.checkins.orderBy('date').last()
  const lastCk: LastCheckin | null = last ? { date: last.date, streak: last.streak } : null
  const streak = nextStreak(lastCk, today)
  const dp = dailyPoints(correctToday, streak)
  const totalPoints = (last ? last.totalPoints : 0) + dp

  const row: CheckinRow = { date: today, streak, dailyPoints: dp, totalPoints }
  await db.checkins.put(row)
  return { alreadyCheckedIn: false, streak, dailyPoints: dp, totalPoints }
}

export interface HomeStats {
  checkedInToday: boolean
  streak: number
  totalPoints: number
}

export async function getHomeStats(today: string): Promise<HomeStats> {
  const last = await db.checkins.orderBy('date').last()
  const lastCk: LastCheckin | null = last ? { date: last.date, streak: last.streak } : null
  return {
    checkedInToday: last?.date === today,
    streak: currentStreak(lastCk, today),
    totalPoints: last ? last.totalPoints : 0,
  }
}
