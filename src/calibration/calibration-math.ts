/** 银行卡（ISO/IEC 7810 ID-1）标准宽度，单位毫米 */
export const CARD_WIDTH_MM = 85.6

/**
 * 由「与银行卡等宽的横条 CSS 像素宽度」求该屏幕的 CSS 像素/毫米。
 * 标定与绘制都用 CSS 像素，故该比值自洽，与 devicePixelRatio 无关。
 */
export function cssPxPerMm(cardCssPx: number): number {
  if (!(cardCssPx > 0)) {
    throw new Error(`cardCssPx must be > 0, got ${cardCssPx}`)
  }
  return cardCssPx / CARD_WIDTH_MM
}

/** 把物理毫米换算成 CSS 像素 */
export function mmToCssPx(mm: number, pxPerMm: number): number {
  return mm * pxPerMm
}
