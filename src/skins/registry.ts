import type { Skin } from './types'
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
  return localStorage.getItem(STORAGE_KEY) || 'plain'
}

export function setSkinId(id: string): void {
  localStorage.setItem(STORAGE_KEY, id)
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
  space: 300,
  shrine: 300,
}

export function skinUnlockCost(id: string): number {
  return SKIN_UNLOCK_COST[id] ?? 0
}

/** 累计积分达门槛即解锁 */
export function isSkinUnlocked(id: string, totalPoints: number): boolean {
  return totalPoints >= skinUnlockCost(id)
}
