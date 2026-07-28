/**
 * 皮肤的怪兽轮换池：三个游戏皮肤（太空 / 神庙 / 森林）共用同一套规则——
 * 基础池恒在轮换里，储备怪只有孩子在图鉴中捕获后才加入。
 *
 * 抽出来是因为这段逻辑本来在每个 Stage 里各有一份，第三份出现时就该合并了。
 * 尤其是 pickForSeq 里的负数兜底：JS 的 % 对负数返回负值，
 * 直接 pool[seq % n] 会拿到 undefined，抄第三遍迟早抄漏。
 */

/** 实际轮换池 = 基础池 + 已捕获的本世界储备怪。id 形状是 `世界-名字`。 */
export function buildRotationPool<T extends { name: string }>(
  base: readonly T[],
  reserve: readonly T[],
  world: string,
  capturedReserveIds: readonly string[] = [],
): T[] {
  const extra = reserve.filter((item) => capturedReserveIds.includes(`${world}-${item.name}`))
  return [...base, ...extra]
}

/** 第 seq 项（0-based），循环轮换；seq 为负也不越界 */
export function pickForSeq<T>(pool: readonly T[], seq: number): T {
  const n = pool.length
  return pool[((seq % n) + n) % n]
}
