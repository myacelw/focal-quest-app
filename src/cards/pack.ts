import { pickWeighted } from '../data/pick-weighted'
import { CARD_RARITY_ORDER, type CardDef, type CardRarity, type CardSet } from './card-defs'

/**
 * 卡包单价。≈ 稳定期 1.4 天 / 新手 2.8 天所得（一天进账 180~360 分）。
 *
 * 定得高于"每天都能开"是刻意的：即时反馈已经被怪兽图鉴占住（打卡必得一只），
 * 卡包的定位是"攒几天的大奖"。两个系统因此不打架。改这一处即可调价。
 */
export const PACK_COST = 500

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
