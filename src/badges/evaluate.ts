import { BADGES } from './badge-defs'
import type { BadgeStats } from './stats-derive'

/** 返回已达成（stats[metric] >= threshold）的 badge id 列表 */
export function evaluate(stats: BadgeStats): string[] {
  return BADGES.filter((b) => stats[b.metric] >= b.threshold).map((b) => b.id)
}
