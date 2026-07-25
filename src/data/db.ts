import Dexie, { type Table } from 'dexie'
import { syncFieldsFor } from '../sync/migrate-fields'
import type { SyncKind } from '../sync/sync-keys'

/**
 * v6 起 7 张业务表共有的同步字段（spec §6.2）。
 * 全部**可选**：存量行在迁移前没有，且既有构造点（doCheckIn / addReward / saveSession …）
 * 不必改一个字——uuid/updatedAt 由 src/data/api.ts 的入队逻辑统一补齐。
 */
export interface SyncableRow {
  /** 同步身份，见 src/sync/sync-keys.ts */
  uuid?: string
  /** LWW 判据：本地写入时刻（毫秒） */
  updatedAt?: number
  /** 档案 id，一期恒为 'default'（多档案是 3c） */
  profileId?: string
}

export interface SessionRow extends SyncableRow {
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

export interface CheckinRow extends SyncableRow {
  date: string
  streak: number
  dailyPoints: number
  totalPoints: number
}

export interface BadgeRow extends SyncableRow {
  id: string
  unlockedAt: number
}

/** 怪兽图鉴捕获记录（v3 新增） */
export interface MonsterRow extends SyncableRow {
  /** 主键 = MonsterDef.id */
  id: string
  /** 捕获时间戳 */
  capturedAt: number
  /** 捕获来源：daily 保底 / egg 彩蛋 */
  source: 'daily' | 'egg'
}

/** 家长自定义的现实奖励（v4 新增） */
export interface RewardRow extends SyncableRow {
  id?: number           // ++id 自增
  title: string
  cost: number
  active: boolean       // 软删：删除即置 false，历史兑换的名称快照不受影响
  createdAt: number
}

/** 积分消耗账本：兑换奖励 / 买补签卡（v4 新增） */
export interface RedemptionRow extends SyncableRow {
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

/** 线下验光记录（v5 新增），视力为小数记法（0.6/0.8/1.0） */
export interface ExamRow extends SyncableRow {
  id?: number       // ++id
  date: string      // 本地 YYYY-MM-DD，验光日期
  left: number      // 左眼视力，小数记法
  right: number     // 右眼视力，小数记法
  note?: string     // 备注（如度数、医院名）
}

/**
 * 待推送队列（v6 新增）。写入点只管入队、立刻返回，发送与重试由同步引擎负责——
 * 训练流程永远不等网络。
 */
export interface OutboxRow {
  id?: number
  uuid: string
  kind: SyncKind
  payload: unknown
  updatedAt: number
  op: 'put' | 'delete'
}

/**
 * 同步元数据（v6 新增）。键：token / email / userId / inviteCode / isAdmin /
 * lastPulledSeq / lastSyncedAt / lastError。
 * 放 Dexie 而非 localStorage：restoreBackup() 覆盖 7 张业务表时不会波及登录态，
 * 备份文件里也不会夹带会话令牌。
 */
export interface SyncMetaRow {
  key: string
  value: string
}

export class FocalQuestDB extends Dexie {
  sessions!: Table<SessionRow, number>
  checkins!: Table<CheckinRow, string>
  badges!: Table<BadgeRow, string>
  monsters!: Table<MonsterRow, string>
  rewards!: Table<RewardRow, number>
  redemptions!: Table<RedemptionRow, number>
  exams!: Table<ExamRow, number>
  outbox!: Table<OutboxRow, number>
  syncMeta!: Table<SyncMetaRow, string>

  /** 库名可注入：生产恒为 'focalquest'，迁移单测用独立库名建 v5 数据再升级验证 */
  constructor(name = 'focalquest') {
    super(name)
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
    this.version(5).stores({
      // 重复声明完整 schema，便于回滚/排查；新增 exams 表
      sessions: '++id, date',
      checkins: 'date',
      badges: 'id',
      monsters: 'id',
      rewards: '++id',
      redemptions: '++id, kind, status',
      exams: '++id, date',
    })
    this.version(6)
      .stores({
        // 重复声明完整 schema，便于回滚/排查；7 表加 uuid 索引（同步引擎按它找本地行），
        // 新增 outbox（待推送队列）与 syncMeta（账号与游标）
        sessions: '++id, date, uuid',
        checkins: 'date, uuid',
        badges: 'id, uuid',
        monsters: 'id, uuid',
        rewards: '++id, uuid',
        redemptions: '++id, kind, status, uuid',
        exams: '++id, date, uuid',
        outbox: '++id, uuid, kind',
        syncMeta: 'key',
      })
      .upgrade(async (tx) => {
        // 给存量数据补同步字段。fallback 只在行内时间戳缺失/损坏时才用得上（见 syncFieldsFor）。
        const fallback = Date.now()
        const jobs: [SyncKind, string][] = [
          ['session', 'sessions'],
          ['checkin', 'checkins'],
          ['badge', 'badges'],
          ['monster', 'monsters'],
          ['reward', 'rewards'],
          ['redemption', 'redemptions'],
          ['exam', 'exams'],
        ]
        for (const [kind, table] of jobs) {
          await tx.table(table).toCollection().modify((row: Record<string, unknown>) => {
            // ⚠️ 逐行兜底：单行派生失败**绝不能**让整个 versionchange 事务回滚。
            // 一旦回滚，db.open() 每次都失败 → app 直接白屏，用户只能换环境才恢复
            // （"iPad 白屏"正是最近一次提交刚修过的故障模式）。
            // 迁移宁可留几行没 uuid——它们会在下一次入队/同步补扫时补上（见 syncNow 的补扫）。
            try {
              Object.assign(row, syncFieldsFor(kind, row, fallback))
            } catch {
              /* 单行失败：跳过这一行，不整体回滚 */
            }
          })
        }
      })
  }
}

export const db = new FocalQuestDB()
