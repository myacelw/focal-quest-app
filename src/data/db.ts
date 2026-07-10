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

/** 怪兽图鉴捕获记录（v3 新增） */
export interface MonsterRow {
  /** 主键 = MonsterDef.id */
  id: string
  /** 捕获时间戳 */
  capturedAt: number
  /** 捕获来源：daily 保底 / egg 彩蛋 */
  source: 'daily' | 'egg'
}

export class FocalQuestDB extends Dexie {
  sessions!: Table<SessionRow, number>
  checkins!: Table<CheckinRow, string>
  badges!: Table<BadgeRow, string>
  monsters!: Table<MonsterRow, string>

  constructor() {
    super('focalquest')
    this.version(1).stores({
      sessions: '++id, date',
      checkins: 'date',
    })
    this.version(2).stores({
      badges: 'id',
    })
    this.version(3).stores({
      // 重复声明完整 schema，便于回滚/排查；新增 monsters 表
      sessions: '++id, date',
      checkins: 'date',
      badges: 'id',
      monsters: 'id',
    })
  }
}

export const db = new FocalQuestDB()
