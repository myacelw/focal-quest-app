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

/**
 * 宫格图的边长（格/行）。**改这一个常量就能换网格**，路径与坐标全是派生的。
 *
 * 取 2 而不是 4 是画质决定：Gemini 输出恒为 1024×1024，4×4 时单格只有 256px，
 * 而卡片放大态是 240 CSS px、在 iPad 视网膜屏上等于 480 物理像素——要拉伸 1.9 倍，
 * 明显发软。2×2 单格 512px 正好原生不拉伸。代价是每套要出 8 张图而不是 2 张。
 *
 * 附带好处：32 张按 4 张/图切开后，**最后一张图恰好是那 4 张闪卡**，
 * 出图提示词能纯粹地写"这四张全是传说级"，不必在一张图里同时交代三个稀有度档次
 * （4×4 那版就是因为混着写，符文被串到了别的格子上）。
 */
export const SHEET_GRID = 2

/** 每张宫格图的格数 */
export const PER_SHEET = SHEET_GRID * SHEET_GRID

export interface CardDef {
  /** 主键，如 'pony-7'。**不得含冒号**（同步 uuid 反解依赖，见 sync-keys.naturalKeyFromUuid） */
  id: string
  setId: string
  rarity: CardRarity
  /** 完整 i18n key，渲染时 t(nameKey)。缺失时 UI 回落到「套名 #编号」（见 CardAlbum.cardName） */
  nameKey: string
  /** 在第几张宫格图（1 起） */
  sheet: number
  /** 宫格图里的格子，0..PER_SHEET-1（行优先） */
  index: number
}

export interface CardSet {
  id: string
  nameKey: string
  cards: CardDef[]
}

/** 每套张数。按 PER_SHEET 切开即每套的宫格图张数（32 / 4 = 8 张） */
export const PER_SET = 32

/** 每套的宫格图张数 */
export const SHEETS_PER_SET = PER_SET / PER_SHEET

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
      sheet: Math.floor(i / PER_SHEET) + 1,
      index: i % PER_SHEET,
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

/** 宫格图里的行列（行优先，网格边长 = SHEET_GRID） */
export function cardSheetPos(def: CardDef): { row: number; col: number } {
  return { row: Math.floor(def.index / SHEET_GRID), col: def.index % SHEET_GRID }
}

/** 宫格图 URL。路径不写进数据，避免 64 条重复字符串 */
export function cardSheetUrl(def: CardDef): string {
  return asset(`/cards/${def.setId}/sheet${def.sheet}.webp`)
}
