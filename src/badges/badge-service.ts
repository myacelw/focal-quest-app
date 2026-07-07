import { db } from '../data/db'
import { deriveStats } from './stats-derive'
import { evaluate } from './evaluate'
import { BADGES, type BadgeDef } from './badge-defs'
import { pushBadges } from '../data/api'

/** 检测并写入新解锁的勋章，返回新解锁的定义列表 */
export async function syncBadges(now: number): Promise<BadgeDef[]> {
  const [sessions, checkins, existing] = await Promise.all([
    db.sessions.toArray(),
    db.checkins.toArray(),
    db.badges.toArray(),
  ])
  const achieved = new Set(evaluate(deriveStats(sessions, checkins)))
  const have = new Set(existing.map((b) => b.id))
  const newIds = [...achieved].filter((id) => !have.has(id))
  if (newIds.length > 0) {
    const rows = newIds.map((id) => ({ id, unlockedAt: now }))
    await db.badges.bulkPut(rows)
    pushBadges(rows)
  }
  const byId = new Map(BADGES.map((b) => [b.id, b]))
  return newIds.map((id) => byId.get(id)).filter((b): b is BadgeDef => b !== undefined)
}

export async function getUnlockedIds(): Promise<Set<string>> {
  const rows = await db.badges.toArray()
  return new Set(rows.map((b) => b.id))
}
