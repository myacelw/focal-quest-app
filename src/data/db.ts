import Dexie, { type Table } from 'dexie'

export interface SessionRow {
  id?: number
  date: string
  startedAtMs: number
  eye: 'left' | 'right'
  answered: number
  correct: number
  flips: number
  elapsedSec: number
  acuity: number
  avgReactionMs?: number
}

export interface CheckinRow {
  date: string
  streak: number
  dailyPoints: number
  totalPoints: number
}

export interface BadgeRow {
  id: string
  unlockedAt: number
}

export class FocalQuestDB extends Dexie {
  sessions!: Table<SessionRow, number>
  checkins!: Table<CheckinRow, string>
  badges!: Table<BadgeRow, string>

  constructor() {
    super('focalquest')
    this.version(1).stores({
      sessions: '++id, date',
      checkins: 'date',
    })
    this.version(2).stores({
      badges: 'id',
    })
  }
}

export const db = new FocalQuestDB()
