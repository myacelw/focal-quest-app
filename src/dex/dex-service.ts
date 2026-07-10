import { db, type MonsterRow } from '../data/db'
import { MONSTER_DEFS, type MonsterDef, type World } from './monster-defs'
import { pickCapture, shouldDailyCapture, canEggCapture, type CaptureSource } from './capture'
import { pushMonsters } from '../data/api'
import { toDateStr } from '../data/date-utils'

/** 把时间戳按本地日期转 YYYY-MM-DD（与打卡 date 同套约定） */
function toLocalDateStr(ts: number): string {
  return toDateStr(new Date(ts))
}

/** 当天某 source 的捕获数（按本地日期判定） */
export async function getCaptureCountToday(todayStr: string, source: CaptureSource): Promise<number> {
  const rows = await db.monsters.toArray()
  let n = 0
  for (const r of rows) {
    if (r.source === source && toLocalDateStr(r.capturedAt) === todayStr) n++
  }
  return n
}

export async function getOwnedMonsters(): Promise<MonsterRow[]> {
  const rows = await db.monsters.toArray()
  return rows.sort((a, b) => a.capturedAt - b.capturedAt)
}

export async function getOwnedIds(): Promise<Set<string>> {
  const rows = await db.monsters.toArray()
  return new Set(rows.map((m) => m.id))
}

export interface DexProgress {
  owned: number
  total: number
  byWorld: Record<World, number>
  /** 每世界总数（派生自 MONSTER_DEFS，扩池自动跟随，避免调用方硬编码） */
  byWorldTotal: Record<World, number>
}

export async function getDexProgress(): Promise<DexProgress> {
  const rows = await db.monsters.toArray()
  const owned = new Set(rows.map((r) => r.id))
  const byWorld: Record<World, number> = { space: 0, shrine: 0 }
  const byWorldTotal: Record<World, number> = { space: 0, shrine: 0 }
  for (const def of MONSTER_DEFS) {
    byWorldTotal[def.world]++
    if (owned.has(def.id)) byWorld[def.world]++
  }
  return { owned: owned.size, total: MONSTER_DEFS.length, byWorld, byWorldTotal }
}

/** 按世界返回已捕获的储备怪 id（rarity !== common），用于扩展皮肤轮换池 */
export async function getOwnedReserveIdsByWorld(): Promise<Record<World, string[]>> {
  const rows = await db.monsters.toArray()
  const owned = new Set(rows.map((r) => r.id))
  const byWorld: Record<World, string[]> = { space: [], shrine: [] }
  for (const def of MONSTER_DEFS) {
    if (def.rarity !== 'common' && owned.has(def.id)) {
      byWorld[def.world].push(def.id)
    }
  }
  return byWorld
}

/**
 * 触发一次捕获：
 *  - daily：保底（仅首次打卡时调用，调用方负责判定 alreadyCheckedIn）
 *  - egg：彩蛋（受每日上限约束）
 * 落库 + 同步后端；未触发或池空时返回 null。
 */
export async function captureMonster(
  source: CaptureSource,
  todayStr: string,
  now: number,
): Promise<MonsterDef | null> {
  if (source === 'egg') {
    const todayEggCount = await getCaptureCountToday(todayStr, 'egg')
    if (!canEggCapture(todayEggCount)) return null
  }

  const owned = await getOwnedIds()
  const picked = pickCapture([...owned], source, Math.random())
  if (!picked) return null

  const row: MonsterRow = { id: picked.id, capturedAt: now, source }
  await db.monsters.put(row)
  pushMonsters([row])
  return picked
}

/** 结算页：保底捕获（仅首次打卡触发） */
export async function captureDailyOnCheckin(
  alreadyCheckedIn: boolean,
  todayStr: string,
  now: number,
): Promise<MonsterDef | null> {
  if (!shouldDailyCapture(alreadyCheckedIn)) return null
  return captureMonster('daily', todayStr, now)
}
