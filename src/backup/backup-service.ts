import { db } from '../data/db'
import { buildBackup, validateBackup, backupFilename, type BackupFile, type BackupTables } from './backup'
import { toDateStr } from '../data/date-utils'
import { lsGet, lsSet } from '../data/storage'
import { pushAll } from '../data/api'

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
  // 恢复的是"别处的全量数据"，本地行的 uuid/updatedAt 随文件而来（v6 之前的老备份里干脆没有）。
  // 全量重推一遍让云端与恢复后的本地一致；否则下一次拉取会把刚被覆盖掉的旧记录又拉回来。
  //
  // 之所以敢在这里 pushAll，全靠 uuid 是**确定性派生**的（Task 2）：bulkPut 会把行里原有的
  // uuid 抹掉（老备份没这个字段），pushAll 再按行内业务字段重新派生，算出的还是同一个 uuid
  // → 云端 LWW 收敛成一行。若 uuid 是随机的，这里就会在云端复制出一份"孤儿 + 新行"，
  // 另一台设备 pull 后两行都插进本地 → 当日答对数翻倍 → 积分/统计/勋章判定全错。
  await pushAll()
}

/** 上次备份时间戳，未备份为 null */
export function lastBackupAt(): number | null {
  const v = lsGet('fzp.lastBackupAt')
  return v ? Number(v) : null
}
