/**
 * 推算式 CPM（cycles per minute）。
 * 每完成一次「答题 + 翻拍过渡」= 一次翻转（半 cycle）；1 cycle = 2 flips。
 * 依赖孩子诚实翻拍（迭代0结论），非临床精确值。
 */
export function cpm(flips: number, elapsedSec: number): number {
  if (elapsedSec <= 0) return 0
  return flips / 2 / (elapsedSec / 60)
}
