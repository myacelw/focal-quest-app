import type { Skin } from './types'
import { lsGet, lsSet } from '../data/storage'
import { PlainStage } from './PlainStage'
import { SpaceStage } from './space/SpaceStage'
import { ShrineStage } from './shrine/ShrineStage'

export const SKINS: Skin[] = [
  { id: 'plain', name: '朴素', Stage: PlainStage },
  { id: 'space', name: '太空射击', Stage: SpaceStage },
  { id: 'shrine', name: '神庙勇者', Stage: ShrineStage },
]

const STORAGE_KEY = 'fzp.skinId'

export function getSkinId(): string {
  return lsGet(STORAGE_KEY) || 'plain'
}

export function setSkinId(id: string): void {
  lsSet(STORAGE_KEY, id)
}

/** 按 id 取皮肤，未知 id 回退到第一个（plain） */
export function getSkin(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]
}

/**
 * 皮肤解锁所需累计积分：练习赚分达门槛即永久解锁（不扣分，累计分只增不减，
 * 故解锁状态纯派生、无需持久化）。朴素免费保底可玩。想全开只需把价都设 0。
 */
export const SKIN_UNLOCK_COST: Record<string, number> = {
  plain: 0,
  space: 1000,   // ≈ 练几天解锁（第一个奖励皮肤）
  shrine: 2500,  // ≈ 练两周解锁（进阶皮肤，比太空更难得）
}

export function skinUnlockCost(id: string): number {
  return SKIN_UNLOCK_COST[id] ?? 0
}

/** 累计积分达门槛即解锁 */
export function isSkinUnlocked(id: string, totalPoints: number): boolean {
  return totalPoints >= skinUnlockCost(id)
}

/** 本次打卡从 prevPoints 涨到 totalPoints，跨过门槛新解锁的皮肤（用于结算页庆祝） */
export function newlyUnlockedSkins(prevPoints: number, totalPoints: number): Skin[] {
  return SKINS.filter((s) => {
    const c = skinUnlockCost(s.id)
    return c > prevPoints && c <= totalPoints
  })
}

/** 首页/设置里可选的“随机皮肤”存储值：每节训练临时挑一个已解锁的游戏皮肤 */
export const RANDOM_SKIN_ID = 'random'

/** 选“随机”时为一节训练挑皮肤：只在已解锁的游戏皮肤（排除朴素）里选；一个都没有则回退朴素。 */
export function pickRandomSkin(totalPoints: number, rand: number): string {
  const pool = SKINS.filter((s) => s.id !== 'plain' && isSkinUnlocked(s.id, totalPoints))
  if (pool.length === 0) return 'plain'
  return pool[Math.min(pool.length - 1, Math.floor(rand * pool.length))].id
}
