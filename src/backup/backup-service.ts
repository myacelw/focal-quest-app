import { db } from '../data/db'
import { buildBackup, validateBackup, backupFilename, type BackupFile, type BackupTables } from './backup'
import { toDateStr } from '../data/date-utils'
import { lsGet, lsSet } from '../data/storage'

/** 收集全部 fzp.* localStorage 键（不硬编码清单，将来加设置自动纳入） */
function collectSettings(): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('fzp.')) out[k] = localStorage.getItem(k) ?? ''
  }
  return out
}

async function readTables(): Promise<BackupTables> {
  const [sessions, checkins, badges, monsters, rewards, redemptions, exams] = await Promise.all([
    db.sessions.toArray(), db.checkins.toArray(), db.badges.toArray(),
    db.monsters.toArray(), db.rewards.toArray(), db.redemptions.toArray(), db.exams.toArray(),
  ])
  return { sessions, checkins, badges, monsters, rewards, redemptions, exams }
}

/** 导出：组装 → Blob 下载 → 记录备份时间（iPad Safari 会存入"文件"App） */
export async function exportBackup(): Promise<void> {
  const file = buildBackup(await readTables(), collectSettings(), Date.now())
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const aEl = document.createElement('a')
  aEl.href = url
  aEl.download = backupFilename(toDateStr(new Date()))
  aEl.click()
  URL.revokeObjectURL(url)
  lsSet('fzp.lastBackupAt', String(Date.now()))
}

/** 解析并校验文件；格式不对返回 null（不动现有数据） */
export async function parseBackupFile(f: File): Promise<BackupFile | null> {
  try {
    const data: unknown = JSON.parse(await f.text())
    return validateBackup(data) ? data : null
  } catch {
    return null
  }
}

/** 覆盖恢复：清空 7 表 → 整体写回 → settings 写回（仅 fzp.* 键，防夹带） */
export async function restoreBackup(file: BackupFile): Promise<void> {
  await db.transaction('rw', [db.sessions, db.checkins, db.badges, db.monsters, db.rewards, db.redemptions, db.exams], async () => {
    await Promise.all([
      db.sessions.clear(), db.checkins.clear(), db.badges.clear(),
      db.monsters.clear(), db.rewards.clear(), db.redemptions.clear(), db.exams.clear(),
    ])
    await db.sessions.bulkPut(file.tables.sessions)
    await db.checkins.bulkPut(file.tables.checkins)
    await db.badges.bulkPut(file.tables.badges)
    await db.monsters.bulkPut(file.tables.monsters)
    await db.rewards.bulkPut(file.tables.rewards)
    await db.redemptions.bulkPut(file.tables.redemptions)
    await db.exams.bulkPut(file.tables.exams)
  })
  for (const [k, v] of Object.entries(file.settings)) {
    if (k.startsWith('fzp.')) lsSet(k, v)
  }
}

/** 上次备份时间戳，未备份为 null */
export function lastBackupAt(): number | null {
  const v = lsGet('fzp.lastBackupAt')
  return v ? Number(v) : null
}
