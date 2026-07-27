/**
 * push 批次校验。服务端不解析 payload 语义（分析在前端），只把关"形状与体量"，
 * 防止塞垃圾数据或用超大 payload 撑爆 D1 免费 5GB。
 */
export const KINDS = ['session', 'checkin', 'badge', 'monster', 'reward', 'redemption', 'exam', 'card'] as const

export interface PushRecord {
  uuid: string
  profileId: string
  kind: string
  payload: unknown
  updatedAt: number
}

export interface Limits {
  maxRecords: number
  maxPayloadBytes: number
  maxUuidLength: number
  /** 允许的时钟超前量：设备时间常有几分钟误差，但不能接受"几个月后"的时间戳
   *  ——那会让该行的 LWW 永久锁死，后续正常更新全被判为"更旧"而丢弃。 */
  maxClockSkewMs: number
  nowMs: number
}

function defaults(): Limits {
  return {
    maxRecords: 500,
    maxPayloadBytes: 16 * 1024,
    maxUuidLength: 128,
    maxClockSkewMs: 24 * 3600_000,
    nowMs: Date.now(),
  }
}

type Result = { ok: true; records: PushRecord[] } | { ok: false; reason: string }

export function validatePushRecords(input: unknown, limits?: Partial<Limits>): Result {
  const lim = { ...defaults(), ...limits }
  if (typeof input !== 'object' || input === null) return { ok: false, reason: 'bad_body' }
  const raw = (input as { records?: unknown }).records
  if (!Array.isArray(raw)) return { ok: false, reason: 'bad_body' }
  if (raw.length > lim.maxRecords) return { ok: false, reason: 'too_many' }

  const out: PushRecord[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return { ok: false, reason: 'bad_record' }
    const r = item as Record<string, unknown>

    if (typeof r.uuid !== 'string' || r.uuid.length === 0 || r.uuid.length > lim.maxUuidLength) {
      return { ok: false, reason: 'bad_uuid' }
    }
    if (typeof r.kind !== 'string' || !(KINDS as readonly string[]).includes(r.kind)) {
      return { ok: false, reason: 'bad_kind' }
    }
    if (typeof r.updatedAt !== 'number' || !Number.isFinite(r.updatedAt) || r.updatedAt <= 0) {
      return { ok: false, reason: 'bad_updated_at' }
    }
    if (r.updatedAt > lim.nowMs + lim.maxClockSkewMs) {
      return { ok: false, reason: 'bad_updated_at' }
    }
    if (r.payload === undefined) return { ok: false, reason: 'bad_payload' }
    if (JSON.stringify(r.payload).length > lim.maxPayloadBytes) {
      return { ok: false, reason: 'payload_too_large' }
    }
    const profileId = typeof r.profileId === 'string' && r.profileId.length > 0 && r.profileId.length <= 64
      ? r.profileId
      : 'default'

    out.push({ uuid: r.uuid, kind: r.kind, payload: r.payload, updatedAt: r.updatedAt, profileId })
  }
  return { ok: true, records: out }
}
