import type {
  SessionRow, CheckinRow, BadgeRow, MonsterRow, RewardRow, RedemptionRow, ExamRow,
} from '../data/db'

/** 备份覆盖的全部 Dexie 表 */
export interface BackupTables {
  sessions: SessionRow[]
  checkins: CheckinRow[]
  badges: BadgeRow[]
  monsters: MonsterRow[]
  rewards: RewardRow[]
  redemptions: RedemptionRow[]
  exams: ExamRow[]
}

export interface BackupFile {
  app: 'focal-quest'        // 标识，防误导别的 JSON
  version: 1                // 备份格式版本
  exportedAt: number
  tables: BackupTables
  settings: Record<string, string>   // fzp.* localStorage 键
}

const TABLE_NAMES = ['sessions', 'checkins', 'badges', 'monsters', 'rewards', 'redemptions', 'exams'] as const

export function buildBackup(
  tables: BackupTables,
  settings: Record<string, string>,
  exportedAt: number,
): BackupFile {
  return { app: 'focal-quest', version: 1, exportedAt, tables, settings }
}

/** 结构校验：标识/版本/7 表均为数组/settings 为对象。只校验结构不深查行类型。 */
export function validateBackup(data: unknown): data is BackupFile {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  if (d.app !== 'focal-quest' || d.version !== 1) return false
  if (typeof d.tables !== 'object' || d.tables === null) return false
  const t = d.tables as Record<string, unknown>
  for (const name of TABLE_NAMES) {
    if (!Array.isArray(t[name])) return false
  }
  if (typeof d.settings !== 'object' || d.settings === null) return false
  return true
}

export function backupFilename(dateStr: string): string {
  return `focalquest-backup-${dateStr}.json`
}
