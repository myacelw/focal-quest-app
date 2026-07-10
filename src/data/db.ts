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

/** 家长自定义的现实奖励（v4 新增） */
export interface RewardRow {
  id?: number           // ++id 自增
  title: string
  cost: number
  active: boolean       // 软删：删除即置 false，历史兑换的名称快照不受影响
  createdAt: number
}

/** 积分消耗账本：兑换奖励 / 买补签卡（v4 新增） */
export interface RedemptionRow {
  id?: number           // ++id 自增
  kind: 'reward' | 'repair'
  title: string         // 名称快照
  cost: number
  createdAt: number
  createdDate: string   // 本地 YYYY-MM-DD，供按月计数（补签上限）
  status: 'pending' | 'fulfilled' | 'cancelled'
  fulfilledAt?: number
  repairDate?: string   // kind='repair' 时 = 补的是哪天（漏掉的那天）
}

export class FocalQuestDB extends Dexie {
  sessions!: Table<SessionRow, number>
  checkins!: Table<CheckinRow, string>
  badges!: Table<BadgeRow, string>
  monsters!: Table<MonsterRow, string>
  rewards!: Table<RewardRow, number>
  redemptions!: Table<RedemptionRow, number>

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
    this.version(4).stores({
      // 重复声明完整 schema，便于回滚/排查；新增 rewards / redemptions 两表
      sessions: '++id, date',
      checkins: 'date',
      badges: 'id',
      monsters: 'id',
      rewards: '++id',
      redemptions: '++id, kind, status',
    })
  }
}

export const db = new FocalQuestDB()
