/** 视力值（小数记法）录入校验：0 < v ≤ 2.0，非有限数拒绝 */
export function isValidAcuity(v: number): boolean {
  return Number.isFinite(v) && v > 0 && v <= 2.0
}
