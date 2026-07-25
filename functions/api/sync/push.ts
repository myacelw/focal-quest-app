import type { Env } from '../../lib/db'
import { bumpCounter } from '../../lib/db'
import { json, errorJson, readJson } from '../../lib/http'
import { requireUser } from '../../lib/auth'
import { validatePushRecords } from '../../lib/sync-validate'

/** 每用户累计记录上限，护住 D1 免费 5GB（正常使用一天只产生十几条，spec §9.3） */
const MAX_TOTAL_RECORDS = 100_000

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const now = Date.now()
  const user = await requireUser(request, env, now)
  if (!user) return errorJson('unauthorized', 401)

  const body = await readJson<unknown>(request)
  if (body === null) return errorJson('bad_request', 400)

  const v = validatePushRecords(body, { nowMs: now })
  if (!v.ok) {
    await bumpCounter(env, `push.reject.${v.reason}`, now)
    return errorJson(v.reason, 400)
  }
  if (v.records.length === 0) {
    const cur = await env.DB.prepare(`SELECT sync_seq FROM users WHERE id = ?`).bind(user.id)
      .first<{ sync_seq: number }>()
    return json({ accepted: 0, seq: cur?.sync_seq ?? 0 })
  }

  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM records WHERE user_id = ?`).bind(user.id)
    .first<{ n: number }>()
  if ((total?.n ?? 0) + v.records.length > MAX_TOTAL_RECORDS) {
    await bumpCounter(env, 'push.reject.quota', now)
    return errorJson('storage_quota_exceeded', 507)
  }

  // 预留 N 个连续 seq（spec §6.3）：SQLite 的 AUTOINCREMENT 在 UPDATE 时不变，
  // 而我们需要"被更新的行也获得更大 seq"，否则其他设备拉不到这次修改。
  // 先原子预留区间，再把区间内的号分给本批记录；若第二步失败只留 seq 空洞，无害。
  const n = v.records.length
  const bumped = await env.DB.prepare(
    `UPDATE users SET sync_seq = sync_seq + ? WHERE id = ? RETURNING sync_seq`,
  ).bind(n, user.id).first<{ sync_seq: number }>()
  if (!bumped) return errorJson('unauthorized', 401)
  const base = bumped.sync_seq - n // 本批可用区间为 (base, base+n]

  const stmts = v.records.map((r, i) =>
    env.DB.prepare(
      `INSERT INTO records (user_id, uuid, profile_id, kind, payload, updated_at, received_at, seq)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, uuid) DO UPDATE SET
         payload     = excluded.payload,
         profile_id  = excluded.profile_id,
         kind        = excluded.kind,
         updated_at  = excluded.updated_at,
         received_at = excluded.received_at,
         seq         = excluded.seq
       WHERE excluded.updated_at > records.updated_at`,
    ).bind(user.id, r.uuid, r.profileId, r.kind, JSON.stringify(r.payload), r.updatedAt, now, base + i + 1),
  )
  await env.DB.batch(stmts)

  await bumpCounter(env, 'push.ok', now)
  await bumpCounter(env, 'active.user', now) // 粗粒度活跃计数（管理后台辅口径）
  return json({ accepted: n, seq: bumped.sync_seq })
}
