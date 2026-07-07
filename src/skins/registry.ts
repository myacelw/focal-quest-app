import type { Skin } from './types'
import { PlainStage } from './PlainStage'
import { SpaceStage } from './space/SpaceStage'

export const SKINS: Skin[] = [
  { id: 'plain', name: '朴素', Stage: PlainStage },
  { id: 'space', name: '太空射击', Stage: SpaceStage },
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
