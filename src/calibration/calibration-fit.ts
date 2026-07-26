import { cssPxPerMm, CARD_WIDTH_MM } from './calibration-math'

/**
 * 窄屏标定：手机竖屏视口物理宽约 62-72mm，比银行卡长边（85.6mm）还窄，
 * 长边模式在 375 屏上最多只能到 4.03 px/mm，而真值约 6.05 —— 在竖屏保存
 * 会把 px/mm 低估 33%，此后所有视标偏小 33%，家长完全察觉不到。
 *
 * 对策：窄屏改用卡片短边（53.98mm）当参照物（375 屏可达 6.39 px/mm），
 * 并在"当前屏够不到已存比值"时禁止保存（见 canSave）。
 * CSS px/mm 是设备常量、与屏幕方向无关，所以"横屏标定 + 竖屏训练"完全合法。
 *
 * 注意：既有 cssPxPerMm / mmToCssPx / CARD_WIDTH_MM 的语义一字未动（有单测锚定），
 * 长边模式仍然直接委托 cssPxPerMm。
 */

/** 银行卡 ISO/IEC 7810 ID-1 短边 */
export const CARD_SHORT_MM = 53.98
/** 右侧拖柄预留宽度（与页面里 maxPx 的算法一致） */
export const HANDLE_RESERVE_PX = 30
/** 参照带最小宽度（太小了对不准） */
export const MIN_CARD_PX = 150
/** 走长边模式所需的最小卡宽：520px ≈ 6.07 px/mm × 85.6mm，覆盖现代手机/平板真值。
 *  够不到就说明这块屏放不下整张卡的长边，必须换短边。 */
export const LONG_EDGE_MIN_PX = 520

export type CardEdge = 'long' | 'short'

/** 当前视口能给参照带的最大宽度 */
export function maxCardPx(availPx: number): number {
  return Math.max(MIN_CARD_PX + 10, Math.floor(availPx - HANDLE_RESERVE_PX))
}

/** 这块屏该用卡片的哪条边做参照 */
export function pickCardEdge(availPx: number): CardEdge {
  return maxCardPx(availPx) >= LONG_EDGE_MIN_PX ? 'long' : 'short'
}

export function edgeMm(edge: CardEdge): number {
  return edge === 'long' ? CARD_WIDTH_MM : CARD_SHORT_MM
}

/** 参照带宽度（CSS px）→ px/mm */
export function ratioFromCardPx(cardPx: number, edge: CardEdge): number {
  if (edge === 'long') return cssPxPerMm(cardPx)
  if (!(cardPx > 0)) throw new Error('cardPx 必须为正数')
  return cardPx / CARD_SHORT_MM
}

/** px/mm → 参照带应有的宽度（CSS px），用于旋转设备后还原滑块位置 */
export function cardPxFromRatio(ratio: number, edge: CardEdge): number {
  if (!(ratio > 0)) throw new Error('ratio 必须为正数')
  return ratio * edgeMm(edge)
}

/**
 * 当前屏是否允许保存标定。
 * 已有存档时必须"够得到"它——否则页面显示的是被 clamp 截断的小值，
 * 家长顺手一点保存就把正确值覆盖成偏小 33% 的坏值（静默破坏医学参数）。
 */
export function canSave(availPx: number, edge: CardEdge, savedRatio: number | null): boolean {
  const max = maxCardPx(availPx)
  if (max < MIN_CARD_PX + 10) return false
  if (savedRatio === null) return true
  return cardPxFromRatio(savedRatio, edge) <= max
}
