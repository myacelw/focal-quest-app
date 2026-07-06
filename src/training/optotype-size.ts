/** 训练标准距离（mm） */
export const TRAIN_DISTANCE_MM = 400

/**
 * 视标整字高度（mm）。视力级别 acuity 下整字张角 = 5/acuity 弧分。
 * h = 2·D·tan( (角/2) )，角由弧分转弧度。
 */
export function optotypeHeightMm(acuity: number, distanceMm = TRAIN_DISTANCE_MM): number {
  if (!(acuity > 0)) {
    throw new Error(`acuity must be > 0, got ${acuity}`)
  }
  const arcMinutes = 5 / acuity
  const radians = (arcMinutes * Math.PI) / (180 * 60)
  return 2 * distanceMm * Math.tan(radians / 2)
}

/** 视标整字高度（CSS px），pxPerMm 来自屏幕标定 */
export function optotypeHeightPx(
  acuity: number,
  pxPerMm: number,
  distanceMm = TRAIN_DISTANCE_MM,
): number {
  return optotypeHeightMm(acuity, distanceMm) * pxPerMm
}

/** Tumbling E 笔画宽 = 缺口宽 = 整字高 / 5（标准 5×5 网格） */
export function strokeWidthPx(heightPx: number): number {
  return heightPx / 5
}
