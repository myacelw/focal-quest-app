import { db } from '../data/db'

/**
 * 清空全部训练/进度数据（7 张 Dexie 表），保留 localStorage 设置
 * （屏幕标定 fzp.cssPxPerMm、语言、皮肤、引导、提醒时间等全部不动）。
 * 后端 SQLite 是防丢副本、只增不删且 app 不从它读，故不同步删除——重置后 app 读空即空。
 */
export async function resetTrainingData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.sessions, db.checkins, db.badges, db.monsters, db.rewards, db.redemptions, db.exams],
    async () => {
      await Promise.all([
        db.sessions.clear(),
        db.checkins.clear(),
        db.badges.clear(),
        db.monsters.clear(),
        db.rewards.clear(),
        db.redemptions.clear(),
        db.exams.clear(),
      ])
    },
  )
}
