import { pickWeighted } from '../data/pick-weighted'
import { CARD_RARITY_ORDER, type CardDef, type CardRarity, type CardSet } from './card-defs'

/**
 * 卡包单价。定得高于"每天都能开"是刻意的：即时反馈已经被怪兽图鉴占住（打卡必得一只），
 * 卡包的定位是"攒几天的大奖"。两个系统因此不打架。改这一处即可调价。
 *
 * ⚠️ 500 → 2000 的由来（2026-07-29 按云端真实数据重定，别再按"门槛"估）：
 * 原注释写"一天进账 180~360 分"，那是拿**完成门槛**（每分钟 5 个 × 6 分钟 = 30 个答对）
 * 当典型值算的。实测她每天答对 90~440 个，**日均进账 1635 分**——差 4.5 倍。
 * 按 500 定价时，攒下的 17885 分立刻能开 35 包 = 一次拿到 55% 卡册，剩下 9 个训练日集齐，
 * 与"一套约两个月"的设计意图差了 6 倍，正要重演图鉴"没几天就收集完了"那次失败。
 *
 * 2000 分 ≈ 1.2 个训练日；集齐 64 张约 78 个训练日 ≈ 3 个月，跨得过 4-6 周疗程。
 * **要调价先重算日均进账**（`SELECT payload FROM records WHERE kind='checkin'` 里的
 * dailyPoints 取真实训练日的平均），不要照抄任何写死的估计值。
 */
export const PACK_COST = 2000

/**
 * 抽卡权重。闪卡权重最低 → 闪卡在抽取顺序上系统性偏后，集齐路上后段惊喜更密
 * （`pack.test.ts` 有方向性回归锚）。
 */
export const PACK_WEIGHTS: Record<CardRarity, number> = { common: 65, rare: 28, shiny: 7 }

/**
 * 从该套**未拥有**的卡里抽 1 张；该套已集齐返回 null。跨套互不影响。
 *
 * 不出重复是产品决策：孩子练一整天换来一张重复的挫败会直接反噬训练动机。
 */
export function pickCard(ownedIds: readonly string[], set: CardSet, rand: number): CardDef | null {
  const owned = new Set(ownedIds)
  const remaining = set.cards.filter((c) => !owned.has(c.id))
  return pickWeighted(remaining, (c) => c.rarity, PACK_WEIGHTS, CARD_RARITY_ORDER, rand)
}
