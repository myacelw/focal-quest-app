import { isTombstone, type SyncKind } from './sync-keys'

export interface RemoteRecord {
  payload: Record<string, unknown>
  updatedAt: number
}

/** put = 用远端 payload 写本地；delete = 删本地行；skip = 本地更权威，什么都不做 */
export type MergeOutcome = { op: 'put' } | { op: 'delete' } | { op: 'skip' }

/**
 * badge / monster 的"首次达成时刻"字段——合并取更早者。
 * ⚠️ 这一条是本文件存在的理由：两台设备各自解开同一枚勋章时，LWW 会留下**较晚**的
 * unlockedAt，而勋章墙和统计都按"首次达成时刻"呈现，取晚的就是错的。
 */
const EARLIEST_FIELD: Partial<Record<SyncKind, string>> = {
  badge: 'unlockedAt',
  monster: 'capturedAt',
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * 按 kind 分派合并策略（spec §6 的规则表）。纯函数：只给结论，不碰 Dexie。
 * `local` 为 null 表示本地查不到这条（按自然键或 uuid 索引都没有）。
 */
export function mergeRecord(
  kind: SyncKind,
  local: Record<string, unknown> | null,
  remote: RemoteRecord,
): MergeOutcome {
  const localAt = local === null ? null : (num(local.updatedAt) ?? 0)

  // 墓碑：删除同样服从 LWW——否则 A 删除、B 随后修改，同步一轮会把 B 的修改抹掉
  if (isTombstone(remote.payload)) {
    if (localAt === null) return { op: 'delete' } // 本地本就没有：幂等空删
    return localAt > remote.updatedAt ? { op: 'skip' } : { op: 'delete' }
  }

  if (local === null || localAt === null) return { op: 'put' }

  const field = EARLIEST_FIELD[kind]
  if (field !== undefined) {
    // 取最早：远端缺该字段时退回 updatedAt，本地缺则视为无穷晚（远端一定更早）
    const remoteT = num(remote.payload[field]) ?? remote.updatedAt
    const localT = num(local[field]) ?? Number.POSITIVE_INFINITY
    return remoteT < localT ? { op: 'put' } : { op: 'skip' }
  }

  // session / checkin / reward / redemption / exam：LWW。相等保留本地（确定且省写盘）
  return remote.updatedAt > localAt ? { op: 'put' } : { op: 'skip' }
}
