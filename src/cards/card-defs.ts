import { asset } from '../data/asset'

/**
 * 卡册的纯数据。**加一套 = 往 CARD_SETS 加一条 + 放两张宫格图 + 加 i18n 文案，
 * 不动任何逻辑代码。**
 *
 * 稀有度用 'shiny'（闪卡）而不是图鉴那套 'epic'：一是贴合集卡语境，二是刻意不 import
 * `src/dex/monster-defs.ts` 的 `Rarity`——卡册与图鉴是两个独立系统（图鉴靠训练免费得、
 * 卡册花积分买），共用类型只会让将来任一边加档位时牵连另一边。
 */
export type CardRarity = 'common' | 'rare' | 'shiny'

/** 档位遍历顺序，喂给 pickWeighted；顺序固定才能确定性测试 */
export const CARD_RARITY_ORDER: readonly CardRarity[] = ['common', 'rare', 'shiny']

export interface CardDef {
  /** 主键，如 'pony-7'。**不得含冒号**（同步 uuid 反解依赖，见 sync-keys.naturalKeyFromUuid） */
  id: string
  setId: string
  rarity: CardRarity
  /** 完整 i18n key，渲染时 t(nameKey)。缺失时 UI 回落到「套名 #编号」（见 CardAlbum.cardName） */
  nameKey: string
  /** 在哪张宫格图：第 1-16 张在 sheet1，第 17-32 张在 sheet2 */
  sheet: 1 | 2
  /** 宫格图里的格子，0..15（行优先） */
  index: number
}

export interface CardSet {
  id: string
  nameKey: string
  cards: CardDef[]
}

/** 每套张数 = 两张 4×4 宫格图 */
export const PER_SET = 32

/**
 * 稀有度按位置分配：第 1-18 张普通、19-28 稀有、29-32 闪卡。
 *
 * 位置固定是刻意的——闪卡恒落在 sheet2 的最后一行，出图时把那 4 格画得最华丽即可，
 * 不必在代码与素材之间来回对照编号。
 */
const RARITY_BY_POSITION: readonly CardRarity[] = [
  ...Array<CardRarity>(18).fill('common'),
  ...Array<CardRarity>(10).fill('rare'),
  ...Array<CardRarity>(4).fill('shiny'),
]

function makeSet(setId: string): CardSet {
  const cards: CardDef[] = RARITY_BY_POSITION.map((rarity, i) => {
    const n = i + 1
    return {
      id: `${setId}-${n}`,
      setId,
      rarity,
      // nameKey 补零（card.pony.07）纯为对齐好读；id 不补零（pony-7）是为了短
      nameKey: `card.${setId}.${String(n).padStart(2, '0')}`,
      sheet: (n <= 16 ? 1 : 2) as 1 | 2,
      index: (n - 1) % 16,
    }
  })
  return { id: setId, nameKey: `card.set.${setId}`, cards }
}

/** 首批两套：魔法小马、深海精灵 */
export const CARD_SETS: CardSet[] = [makeSet('pony'), makeSet('deep')]

export const TOTAL_CARDS = CARD_SETS.reduce((sum, s) => sum + s.cards.length, 0)

export function cardSetById(setId: string): CardSet | undefined {
  return CARD_SETS.find((s) => s.id === setId)
}

export function getCardDef(id: string): CardDef | undefined {
  for (const s of CARD_SETS) {
    const found = s.cards.find((c) => c.id === id)
    if (found) return found
  }
  return undefined
}

/** 宫格图里的行列（与 BadgeCard.spritePos 同一套 4×4 约定） */
export function cardSheetPos(def: CardDef): { row: number; col: number } {
  return { row: Math.floor(def.index / 4), col: def.index % 4 }
}

/** 宫格图 URL。路径不写进数据，避免 64 条重复字符串 */
export function cardSheetUrl(def: CardDef): string {
  return asset(`/cards/${def.setId}/sheet${def.sheet}.webp`)
}
