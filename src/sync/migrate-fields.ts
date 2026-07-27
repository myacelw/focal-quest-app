import { recordUuid, newUuid, type SyncKind } from './sync-keys'

/**
 * 每类记录"行内既有的时间戳"字段。8 张业务表恰好都有一个——
 * 这不是巧合而是运气好，正因如此迁移才能完全不依赖 Date.now()（见 syncFieldsFor 的注释）。
 */
const TIME_FIELD: Record<SyncKind, string> = {
  session: 'startedAtMs',
  checkin: 'date', // 只有日期，按 UTC 零点折算
  badge: 'unlockedAt',
  monster: 'capturedAt',
  reward: 'createdAt',
  redemption: 'createdAt',
  exam: 'date', // 同 checkin
  card: 'obtainedAt',
}

/** 'YYYY-MM-DD' → UTC 零点毫秒；形状不对返回 null */
export function dateStrToMs(v: unknown): number | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const ms = Date.parse(`${v}T00:00:00Z`)
  return Number.isFinite(ms) ? ms : null
}

export interface SyncFields {
  uuid: string
  updatedAt: number
  profileId: string
}

/**
 * 存量行 → v6 新增的三个同步字段。
 *
 * ⚠️ updatedAt 刻意**不取 Date.now()**：两台设备迁移的时刻必然不同，那会让"后迁移的那台"
 * 凭 LWW 赢下所有历史行、把对面设备的合法修改统统盖掉。取行内既有时间戳则两台算出
 * **同一个值** → LWW 打平、谁也不覆盖谁；此后真实修改（updatedAt=写入时刻）自然更大、照常生效。
 *
 * 已有 uuid / updatedAt 的行一律沿用，使本函数幂等（将来若有 v7 再扫一遍也不会改动身份）。
 */
export function syncFieldsFor(
  kind: SyncKind,
  row: Record<string, unknown>,
  fallbackMs: number,
  newId: () => string = newUuid,
): SyncFields {
  // profileId 必须先算出来——它是 uuid 的一部分（deterministicUuid 的中段）
  const profileId = typeof row.profileId === 'string' && row.profileId.length > 0 ? row.profileId : 'default'
  const uuid = recordUuid(kind, row, profileId, newId)
  const existing = typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) ? row.updatedAt : null
  const raw = row[TIME_FIELD[kind]]
  const fromRow = typeof raw === 'number' && Number.isFinite(raw) ? raw : dateStrToMs(raw)
  return { uuid, updatedAt: existing ?? fromRow ?? fallbackMs, profileId }
}
