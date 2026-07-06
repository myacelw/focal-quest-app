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
}

export interface CheckinRow {
  date: string
  streak: number
  dailyPoints: number
  totalPoints: number
}

export class FocalQuestDB extends Dexie {
  sessions!: Table<SessionRow, number>
  checkins!: Table<CheckinRow, string>

  constructor() {
    super('focalquest')
    this.version(1).stores({
      sessions: '++id, date',
      checkins: 'date',
    })
  }
}

export const db = new FocalQuestDB()
