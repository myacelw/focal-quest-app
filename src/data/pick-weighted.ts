/**
 * 按档位权重从剩余池里抽 1 个。原本内联在 `src/dex/capture.ts` 的 `pickCapture` 里，
 * 卡包要按「套」抽、复用不了那份把 MONSTER_DEFS 写死在函数体里的实现，故抽成共用纯函数
 * （`training/key-map.ts` 从 TrainingPage 抽出来是同一个理由：两处各写一份必然漂移）。
 *
 * 档位类型泛型化，**刻意不 import `Rarity`**——它住在 `src/dex/`，
 * 让 `src/data/` 反过来依赖 `src/dex/` 是错的依赖方向。
 *
 * 两条不可动的性质：
 *  ① 某档池空后，其权重归一化到剩余非空档。否则空档白占概率，rand 落进去只能返回 null。
 *  ② 池内位置**必须用区段余量重新算一个分数**，不能复用 `rand` 本身——
 *    `rand` 已被约束在被选档的权重区段内，直接拿它映射下标会让低权重档只抽到池尾那一个。
 *    （这条是既有实现里修过的 bug，`pick-weighted.test.ts` 有回归锚。）
 *
 * `tierOrder` 决定档位的遍历顺序，故同一个 `rand` 恒定映射到同一个结果（可确定性测试）。
 */
export function pickWeighted<T, K extends string>(
  remaining: readonly T[],
  tierOf: (item: T) => K,
  weights: Record<K, number>,
  tierOrder: readonly K[],
  rand: number,
): T | null {
  if (remaining.length === 0) return null

  const buckets = new Map<K, T[]>()
  for (const tier of tierOrder) buckets.set(tier, [])
  for (const item of remaining) buckets.get(tierOf(item))?.push(item)

  const nonEmpty = tierOrder.filter((tier) => (buckets.get(tier) ?? []).length > 0)
  if (nonEmpty.length === 0) return null

  // 归一化：池空的档权重不计
  const totalWeight = nonEmpty.reduce((sum, tier) => sum + weights[tier], 0)
  const target = rand * totalWeight

  // 选档，并记录 target 落在被选档权重区段内的起点
  let acc = 0
  let chosen: K = nonEmpty[nonEmpty.length - 1] // 兜底：rand 接近 1 时取最后一档
  let segStart = totalWeight - weights[chosen]
  for (const tier of nonEmpty) {
    if (target < acc + weights[tier]) { chosen = tier; segStart = acc; break }
    acc += weights[tier]
  }

  const pool = buckets.get(chosen)!
  const frac = (target - segStart) / weights[chosen]
  return pool[Math.min(pool.length - 1, Math.floor(frac * pool.length))]
}
