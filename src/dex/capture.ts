import { MONSTER_DEFS, type MonsterDef, type Rarity, shinyIdOf } from './monster-defs'
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
 * 闪光掷骰的门槛。**它只控制前期的惊喜密度，不控制总时长。**
 *
 * 因为普通桶抽空后所有掷骰都回落到闪光桶：前期普通桶还有货时闪光按 1/16 稀疏
 * 撒入（82 只普通抽完约需 87 次捕获、约 35 天，期间约出 5 只闪光），之后进入
 * 纯闪光收集期。合计约 68 天。想让闪光更稀有就调小它，不会拖长整体周期。
 */
export const SHINY_CHANCE = 1 / 16

/** 抽中的怪兽本体，以及这次是不是闪光变体 */
export interface CaptureResult {
  def: MonsterDef
  shiny: boolean
}

/**
 * 两步掷骰：先掷是否闪光，再从对应的「未拥有」桶里按稀有度权重抽 1 只。
 * 想要的桶空了就回落到另一个桶；两个都空返回 null（164 个收集品全集齐）。
 *
 * **「不出重复」的铁律照旧成立**——两个桶都只装未拥有的条目。
 *
 * `shinyRand` 与 `rand` 分开是为了可确定性测试：`rand` 决定抽哪只，
 * `shinyRand` 决定闪不闪。生产两个都传 Math.random()。
 *
 * 抽取算法本身（含"某档池空则权重归一化到剩余档"与"池内位置不偏置"两条性质）
 * 已抽到 `src/data/pick-weighted.ts`，与卡包共用——两处各写一份必然漂移，
 * 而那里面"不能复用 rand 决定池内下标"是修过的 bug，尤其不能被抄错。
 */
export function pickCapture(
  ownedIds: string[],
  source: CaptureSource,
  rand: number,
  shinyRand: number = Math.random(),
): CaptureResult | null {
  const owned = new Set(ownedIds)
  const normalPool = MONSTER_DEFS.filter((m) => !owned.has(m.id))
  const shinyPool = MONSTER_DEFS.filter((m) => !owned.has(shinyIdOf(m.id)))

  const wantShiny = shinyRand < SHINY_CHANCE
  const primary = wantShiny ? shinyPool : normalPool
  const usePrimary = primary.length > 0
  const pool = usePrimary ? primary : (wantShiny ? normalPool : shinyPool)
  if (pool.length === 0) return null

  const def = pickWeighted(pool, (m) => m.rarity, WEIGHTS[source], RARITY_LIST, rand)
  if (!def) return null
  return { def, shiny: usePrimary ? wantShiny : !wantShiny }
}

/** 保底捕获触发条件：当天首次完成训练打卡（alreadyCheckedIn === false）时必得 1 只 */
export function shouldDailyCapture(alreadyCheckedIn: boolean): boolean {
  return !alreadyCheckedIn
}

/** 彩蛋捕获是否仍可触发：当天彩蛋捕获数 < 上限 */
export function canEggCapture(todayEggCount: number): boolean {
  return todayEggCount < DAILY_EGG_CAPTURE_MAX
}
