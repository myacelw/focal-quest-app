import { MONSTER_DEFS, type MonsterDef, type Rarity } from './monster-defs'

export type CaptureSource = 'daily' | 'egg'

/** 每日彩蛋捕获上限（彩蛋题答对可额外捕获，每日至多 2 只） */
export const DAILY_EGG_CAPTURE_MAX = 2

/** 抽取权重：保底偏普通、彩蛋偏稀有/史诗（答题技巧兑换成稀有度手感） */
const WEIGHTS: Record<CaptureSource, Record<Rarity, number>> = {
  daily: { common: 70, rare: 25, epic: 5 },
  egg: { common: 30, rare: 45, epic: 25 },
}

const RARITY_LIST: Rarity[] = ['common', 'rare', 'epic']

/**
 * 从未拥有的怪兽中按 source 对应权重抽 1 只；全集返回 null。
 * 某稀有度池空后，其权重归一化到剩余非空稀有度。
 * 单 rand∈[0,1) 同时决定稀有度与池内位置，便于确定性测试。
 */
export function pickCapture(ownedIds: string[], source: CaptureSource, rand: number): MonsterDef | null {
  const owned = new Set(ownedIds)
  const remaining = MONSTER_DEFS.filter((m) => !owned.has(m.id))
  if (remaining.length === 0) return null

  const weights = WEIGHTS[source]
  const buckets: Record<Rarity, MonsterDef[]> = { common: [], rare: [], epic: [] }
  for (const m of remaining) buckets[m.rarity].push(m)

  const nonEmpty = RARITY_LIST.filter((r) => buckets[r].length > 0)
  if (nonEmpty.length === 0) return null

  // 归一化：池空的稀有度权重不计
  const totalWeight = nonEmpty.reduce((sum, r) => sum + weights[r], 0)
  const target = rand * totalWeight
  // 选稀有度，并记录 target 落在被选稀有度权重区段内的起点
  let acc = 0
  let chosenRarity: Rarity = nonEmpty[nonEmpty.length - 1] // 兜底：rand 接近 1 时取最后
  let segStart = totalWeight - weights[chosenRarity]
  for (const r of nonEmpty) {
    if (target < acc + weights[r]) { chosenRarity = r; segStart = acc; break }
    acc += weights[r]
  }

  // 用区段内余量归一化出第二个分数，均匀映射到池内下标——
  // 不能复用 rand 本身（它已被约束在该稀有度区段），否则池内位置严重偏置（史诗只会抽到池尾）。
  const pool = buckets[chosenRarity]
  const frac = (target - segStart) / weights[chosenRarity]
  const i = Math.min(pool.length - 1, Math.floor(frac * pool.length))
  return pool[i]
}

/** 保底捕获触发条件：当天首次完成训练打卡（alreadyCheckedIn === false）时必得 1 只 */
export function shouldDailyCapture(alreadyCheckedIn: boolean): boolean {
  return !alreadyCheckedIn
}

/** 彩蛋捕获是否仍可触发：当天彩蛋捕获数 < 上限 */
export function canEggCapture(todayEggCount: number): boolean {
  return todayEggCount < DAILY_EGG_CAPTURE_MAX
}
