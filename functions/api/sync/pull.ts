import type { Env } from '../../lib/db'
import { json, errorJson } from '../../lib/http'
import { requireUser } from '../../lib/auth'

const DEFAULT_LIMIT = 500
const MAX_LIMIT = 500

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env)
  if (!user) return errorJson('unauthorized', 401)

  const url = new URL(request.url)
  const since = Number(url.searchParams.get('since') ?? '0')
  if (!Number.isFinite(since) || since < 0) return errorJson('bad_since', 400)
  const limitRaw = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), MAX_LIMIT) : DEFAULT_LIMIT

  // 多取一条判断 hasMore，避免额外一次 COUNT 查询
  const rs = await env.DB.prepare(
    `SELECT uuid, profile_id, kind, payload, updated_at, seq
       FROM records WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?`,
  ).bind(user.id, since, limit + 1).all<{
    uuid: string; profile_id: string; kind: string; payload: string; updated_at: number; seq: number
  }>()

  const rows = rs.results ?? []
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  const records = page.map((r) => ({
    uuid: r.uuid,
    profileId: r.profile_id,
    kind: r.kind,
    payload: JSON.parse(r.payload) as unknown,
    updatedAt: r.updated_at,
    seq: r.seq,
  }))
  const nextSince = page.length > 0 ? page[page.length - 1].seq : since

  return json({ records, nextSince, hasMore })
}
