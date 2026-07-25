import type { OutboxRow } from '../data/db'

/** 服务端单批上限 500 条（functions/lib/sync-validate.ts），拉取每页上限同为 500 */
export const MAX_BATCH = 500
/** 服务端 readJson 的 body 上限是 1MB，留足余量 */
export const MAX_BATCH_BYTES = 800_000
export const PULL_LIMIT = 500
/** 入队后的合并抖动：一节训练结束会连着入队 session/checkin/badge/monster，攒 2 秒一次发走 */
export const KICK_DELAY_MS = 2000

/** 指数退避：1s → 2s → 4s …… 封顶 5 分钟。失败一律静默重试，绝不弹窗打扰训练 */
export function nextDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempt), 5 * 60_000)
}

/**
 * 同一 uuid 在 outbox 里可能有多条（兑换从 pending 改 fulfilled 会各推一次）。
 * 只发最新那条即可——服务端是 LWW 快照表，中间态发过去也会被立刻覆盖，纯属浪费流量。
 * 结果按每个 uuid **首次出现**的顺序（Map 的键序），便于人工对着 outbox 排查。
 */
export function dedupeOutbox(rows: OutboxRow[]): OutboxRow[] {
  const best = new Map<string, OutboxRow>()
  for (const r of rows) {
    const cur = best.get(r.uuid)
    if (cur === undefined || r.updatedAt >= cur.updatedAt) best.set(r.uuid, r)
  }
  return [...best.values()]
}

export function chunk<T>(items: T[], size: number): T[][] {
  const step = Math.max(1, size)
  const out: T[][] = []
  for (let i = 0; i < items.length; i += step) out.push(items.slice(i, i + step))
  return out
}

/**
 * 再按 **body 字节数**切一层。服务端 `readJson` 有 1MB 硬上限（`functions/lib/http.ts`），
 * 超了直接 400 —— 而 400 是整批被拒。500 条各带一个大 payload 就可能撞上，
 * 这时"条数没超但体量超了"，只按条数切是发不出去的。
 * 单条自身就超上限时也独立成一批（不死循环，也不悄悄丢掉它——真超 16KB 会被服务端隔离掉，
 * 那条路径由 drainOutbox 的二分定位处理）。
 */
export function chunkByBytes(rows: OutboxRow[], maxBytes: number, maxCount: number): OutboxRow[][] {
  const out: OutboxRow[][] = []
  let cur: OutboxRow[] = []
  let bytes = 0
  for (const r of rows) {
    const size = JSON.stringify(r.payload ?? null).length + r.uuid.length + 64 // 64 ≈ 其余字段与 JSON 标点
    if (cur.length > 0 && (bytes + size > maxBytes || cur.length >= maxCount)) {
      out.push(cur)
      cur = []
      bytes = 0
    }
    cur.push(r)
    bytes += size
  }
  if (cur.length > 0) out.push(cur)
  return out
}

/**
 * 推送失败是**永久**还是暂时。永久 = 服务端整批 schema/体量校验不通过，重试一万次也是同一结果。
 *
 * 为什么必须区分：`validatePushRecords` 是**整批全或无**，一条 bad_updated_at / bad_uuid /
 * payload_too_large 就整批 400。若一律当网络错误无限退避，坏批会永远卡在队首（drainOutbox 串行），
 * 这台设备从此再也同步不了任何数据，而且全程静默。
 *
 * 401 与 429 刻意不算永久：401 要重新登录（由调用方停排程处理）、429 过一会儿就好，
 * 两者都不该把记录隔离掉。5xx / 0（断网）同理，必须原样留在 outbox。
 */
export function isPermanentStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 401 && status !== 429
}
