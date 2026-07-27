import { MONSTER_DEFS, type MonsterDef, type Rarity } from './monster-defs'
import { pickWeighted } from '../data/pick-weighted'

export type CaptureSource = 'daily' | 'egg'

/** 每日彩蛋捕获上限（彩蛋题答对可额外捕获，每日至多 2 只） */
export const DAILY_EGG_CAPTURE_MAX = 2

/** 抽取权重：保底偏普通、彩蛋偏稀有/史诗（答题技巧兑换成稀有度手感） */
const WEIGHTS: Record<CaptureSource, Record<Rarity, number>> = {
  daily: { common: 70, rare: 25, epic: 5 },
  egg: { common: 30, rare: 45, epic: 25 },
}

const RARITY_LIST: readonly Rarity[] = ['common', 'rare', 'epic']

/**
 * 从未拥有的怪兽中按 source 对应权重抽 1 只；全集返回 null。
 * 单 rand∈[0,1) 同时决定稀有度与池内位置，便于确定性测试。
 *
 * 抽取算法本身（含"某档池空则权重归一化到剩余档"与"池内位置不偏置"两条性质）
 * 已抽到 `src/data/pick-weighted.ts`，与卡包共用——两处各写一份必然漂移，
 * 而那里面"不能复用 rand 决定池内下标"是修过的 bug，尤其不能被抄错。
 */
export function pickCapture(ownedIds: string[], source: CaptureSource, rand: number): MonsterDef | null {
  const owned = new Set(ownedIds)
  const remaining = MONSTER_DEFS.filter((m) => !owned.has(m.id))
  return pickWeighted(remaining, (m) => m.rarity, WEIGHTS[source], RARITY_LIST, rand)
}

/** 保底捕获触发条件：当天首次完成训练打卡（alreadyCheckedIn === false）时必得 1 只 */
export function shouldDailyCapture(alreadyCheckedIn: boolean): boolean {
  return !alreadyCheckedIn
}

/** 彩蛋捕获是否仍可触发：当天彩蛋捕获数 < 上限 */
export function canEggCapture(todayEggCount: number): boolean {
  return todayEggCount < DAILY_EGG_CAPTURE_MAX
}
