import { db, type OutboxRow } from '../data/db'
import { mergeRecord } from './merge'
import { isKeyedKind, naturalKeyOf, naturalKeyFromUuid, KINDS, type SyncKind } from './sync-keys'
import { reconcileCheckins, repairDatesFrom } from './reconcile'
import { getAccount, getLastPulledSeq, setLastPulledSeq, getMeta, setMeta, META } from './account'
import {
  dedupeOutbox, chunkByBytes, isPermanentStatus, nextDelayMs,
  MAX_BATCH, MAX_BATCH_BYTES, PULL_LIMIT, KICK_DELAY_MS,
} from './sync-policy'
import { enqueuePut } from '../data/api'
import { setKick } from './kick'

/**
 * 同步引擎：推 outbox → 按游标拉取合并 → 重算打卡链。编排很薄，判定逻辑全在
 * merge.ts / reconcile.ts / sync-policy.ts 里（各有单测）。
 *
 * 铁律：**尽力而为**。没登录、断网、后端挂了都只是"这次不同步"，训练/打卡/统计照常，
 * 失败一律静默 + 指数退避，绝不弹窗打扰训练。
 */
export interface PushRecordDto {
  uuid: string
  profileId: string
  kind: SyncKind
  payload: unknown
  updatedAt: number
}
export interface PulledRecordDto extends PushRecordDto {
  seq: number
}
export interface PushResult {
  ok: boolean
  status: number
}
export interface PullResult extends PushResult {
  records: PulledRecordDto[]
  nextSince: number
  hasMore: boolean
}

/** 网络层抽成接口：单测注入假实现，生产用同域 fetch */
export interface Transport {
  push(records: PushRecordDto[], token: string): Promise<PushResult>
  pull(since: number, limit: number, token: string): Promise<PullResult>
}

const TEST_MODE = import.meta.env.MODE === 'test'
/** 与 data/api.ts 同一个开关：纯静态部署（GitHub Pages 热备链）没有 /api，引擎不启动 */
const SYNC_ENABLED = import.meta.env.VITE_BACKEND !== 'off'

/** 同域实现：Pages Functions 挂在 /api/*，零 CORS、零预检 */
export const httpTransport: Transport = {
  async push(records, token) {
    if (TEST_MODE) return { ok: false, status: 0 }
    try {
      const res = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ records }),
      })
      return { ok: res.ok, status: res.status }
    } catch {
      return { ok: false, status: 0 } // 断网：status 0，交给退避重试
    }
  },
  async pull(since, limit, token) {
    const empty = { records: [] as PulledRecordDto[], nextSince: since, hasMore: false }
    if (TEST_MODE) return { ok: false, status: 0, ...empty }
    try {
      const res = await fetch(`/api/sync/pull?since=${since}&limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return { ok: false, status: res.status, ...empty }
      const data = (await res.json()) as Partial<PullResult>
      return {
        ok: true,
        status: res.status,
        records: Array.isArray(data.records) ? data.records : [],
        nextSince: typeof data.nextSince === 'number' ? data.nextSince : since,
        hasMore: data.hasMore === true,
      }
    } catch {
      return { ok: false, status: 0, ...empty }
    }
  },
}

type AnyRow = Record<string, unknown>

const TABLE_OF: Record<SyncKind, string> = {
  session: 'sessions',
  checkin: 'checkins',
  badge: 'badges',
  monster: 'monsters',
  reward: 'rewards',
  redemption: 'redemptions',
  exam: 'exams',
  card: 'cards',
}

/** 本地主键：checkin 是 date，其余（badge/monster 的字符串 id、自增表的数字 id）都是 id */
function localKeyOf(kind: SyncKind, row: AnyRow): string | number {
  return (kind === 'checkin' ? row.date : row.id) as string | number
}

/** 找本地对应行：KEYED 表按主键，自增表按 uuid 索引 */
async function findLocal(kind: SyncKind, rec: PulledRecordDto): Promise<AnyRow | null> {
  const table = db.table<AnyRow>(TABLE_OF[kind])
  if (isKeyedKind(kind)) {
    // 墓碑 payload 里没有自然键，从 uuid 的 'kind:profileId:key' 形状反解（见 sync-keys）
    const key = naturalKeyOf(kind, (rec.payload ?? {}) as AnyRow) ?? naturalKeyFromUuid(rec.uuid)
    return (await table.get(key)) ?? null
  }
  return (await table.where('uuid').equals(rec.uuid).first()) ?? null
}

async function applyPulled(rec: PulledRecordDto): Promise<void> {
  // 服务端将来扩了 kind 而客户端还是老版本：忽略，不炸（孩子那台可能几周没更新）
  if (!(KINDS as readonly string[]).includes(rec.kind)) return

  const table = db.table<AnyRow>(TABLE_OF[rec.kind])
  const payload = (rec.payload ?? {}) as AnyRow
  const local = await findLocal(rec.kind, rec)
  const outcome = mergeRecord(rec.kind, local, { payload, updatedAt: rec.updatedAt })

  if (outcome.op === 'skip') return
  if (outcome.op === 'delete') {
    if (local !== null) await table.delete(localKeyOf(rec.kind, local))
    return
  }
  const row: AnyRow = { ...payload, uuid: rec.uuid, updatedAt: rec.updatedAt, profileId: rec.profileId }
  // 自增表沿用本地 id（payload 刻意不带 id），否则同一条记录会被插成第二行
  if (!isKeyedKind(rec.kind) && local !== null) row.id = local.id
  await table.put(row)
}

function toDto(rows: OutboxRow[]): PushRecordDto[] {
  return rows.map((r) => ({
    uuid: r.uuid,
    profileId: 'default', // 一期单档案；3c 起 outbox 带上真实 profileId
    kind: r.kind,
    payload: r.payload,
    updatedAt: r.updatedAt,
  }))
}

interface IsolateResult {
  /** false = 暂时性失败，调用方应保留剩余队列并退避重试 */
  ok: boolean
  status: number
  /** 服务端已确认收下的行 */
  sent: OutboxRow[]
  /** 服务端永久拒收、被隔离掉的行 */
  rejected: OutboxRow[]
}

/**
 * 推一批，遇上**永久性** 4xx 就二分定位坏记录。
 *
 * 为什么非二分不可：服务端 `validatePushRecords` 是**整批全或无**——一条 bad_uuid /
 * bad_kind / bad_updated_at / payload_too_large 就整批 400。若把 400 当网络错误无限退避，
 * 坏批会永远卡在队首（drainOutbox 串行），这台设备**从此再也同步不了任何数据**，
 * 而且全程静默；若干脆整批丢弃，一条毒药会带走最多 499 条无辜记录。
 * 二分让影响面收敛到真正非法的那几条，其余照常送出。
 */
async function pushIsolating(transport: Transport, token: string, batch: OutboxRow[]): Promise<IsolateResult> {
  const res = await transport.push(toDto(batch), token)
  if (res.ok) return { ok: true, status: res.status, sent: batch, rejected: [] }
  if (!isPermanentStatus(res.status)) {
    // 0（断网）/ 429 / 5xx / 401：原样留在 outbox，交给退避重试或重新登录
    return { ok: false, status: res.status, sent: [], rejected: [] }
  }
  if (batch.length === 1) {
    // 定位到了：这一条就是毒药，隔离掉
    return { ok: true, status: res.status, sent: [], rejected: batch }
  }
  const mid = Math.floor(batch.length / 2)
  const a = await pushIsolating(transport, token, batch.slice(0, mid))
  if (!a.ok) return a // 前半段撞上暂时性失败：整体中止，剩余的下次再来
  const b = await pushIsolating(transport, token, batch.slice(mid))
  return {
    ok: b.ok,
    status: b.ok ? 200 : b.status,
    // 前半段已确认/已隔离的照常回报，别因后半段失败而重复推送它们
    sent: [...a.sent, ...b.sent],
    rejected: [...a.rejected, ...b.rejected],
  }
}

async function drainOutbox(transport: Transport, token: string): Promise<PushResult> {
  const all = await db.outbox.toArray() // 主键顺序 = 入队顺序
  if (all.length === 0) return { ok: true, status: 200 }

  let rejectedAny = false
  // 先按 uuid 去重，再按条数与**字节数**双重切批（服务端 body 上限 1MB，超了整批 400）
  for (const batch of chunkByBytes(dedupeOutbox(all), MAX_BATCH_BYTES, MAX_BATCH)) {
    const r = await pushIsolating(transport, token, batch)

    // 已确认与已隔离的都要出队；连同被去重丢掉的同 uuid 中间态一起清。
    // 只清本次快照里的 id，不碰同步期间新入队的行。
    const done = new Set([...r.sent, ...r.rejected].map((x) => x.uuid))
    if (done.size > 0) {
      const ids = all.filter((x) => done.has(x.uuid) && x.id !== undefined).map((x) => x.id as number)
      await db.outbox.bulkDelete(ids)
    }
    if (r.rejected.length > 0) rejectedAny = true
    if (!r.ok) return { ok: false, status: r.status } // 暂时性失败：剩余的留队退避重试
  }
  // 有记录被服务端永久拒收：记下来让云同步卡显示出来，别静默
  if (rejectedAny) await setMeta(META.lastError, 'rejected')
  return { ok: true, status: 200 }
}

/**
 * 补扫"漏网行"：有 uuid 才代表进过 outbox。`saveSession` 在 `db.sessions.add` 后就返回了，
 * uuid 回填与入队都在之后的后台 microtask 里；此时切后台 / Safari 回收页面 / IndexedDB
 * 短暂报错（`fire()` 的 catch 会静默吞掉），就留下一条"没有 uuid 也不在 outbox"的孤儿行。
 * 它此后永远不会被推送——`pushAll()` 只在注册/登录/恢复备份时调用。
 * 也就是说"训练记录静默丢失（云端视角）"是可达状态，而这正是本功能存在的理由。
 *
 * 只在 outbox 为空时扫（几千行、一次同步扫一遍可接受）；非空时下一轮排空后自然会扫到。
 * 用 keepUpdatedAt 入队：孤儿行的时间戳应取行内业务时间，不该盖上"现在"。
 */
async function rescanOrphans(): Promise<void> {
  if ((await db.outbox.count()) > 0) return
  for (const kind of KINDS) {
    const table = db.table<AnyRow>(TABLE_OF[kind])
    const orphans = await table.filter((r) => r.uuid === undefined).toArray()
    if (orphans.length > 0) await enqueuePut(kind, orphans, { keepUpdatedAt: true })
  }
}

/** 防御上限：游标异常时不至于无限翻页（200 页 × 500 条 = 10 万，正好是每用户记录上限） */
const MAX_PAGES = 200

async function pullPages(transport: Transport, token: string): Promise<PushResult> {
  let since = await getLastPulledSeq()
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await transport.pull(since, PULL_LIMIT, token)
    if (!res.ok) return { ok: false, status: res.status }
    for (const rec of res.records) await applyPulled(rec)
    since = res.nextSince
    await setLastPulledSeq(since)
    if (!res.hasMore) break
  }
  return { ok: true, status: 200 }
}

/**
 * 拉取落库后必须重算打卡链（spec §6.5）。变化的行重新入队 —— 让所有设备收敛到同一结果。
 * 不会来回打乒乓：重算只依赖 (date, dailyPoints, repairDates) 且严格幂等，
 * 两台设备算出相同结果后 changed 为空、就不再互推了。
 * 返回是否有变化，供 syncNow 决定要不要在**本轮**再排空一次 outbox。
 */
async function reconcileAndWriteBack(): Promise<boolean> {
  const [checkins, reds] = await Promise.all([db.checkins.toArray(), db.redemptions.toArray()])
  if (checkins.length === 0) return false
  const fixed = reconcileCheckins(checkins, repairDatesFrom(reds))
  const before = new Map(checkins.map((c) => [c.date, c]))
  const changed = fixed.filter((row) => {
    const old = before.get(row.date)
    return !old || old.streak !== row.streak || old.dailyPoints !== row.dailyPoints || old.totalPoints !== row.totalPoints
  })
  // enqueuePut 同时写本地行并入 outbox（updatedAt = 现在），故本设备的重算结果会赢下 LWW
  if (changed.length === 0) return false
  await enqueuePut('checkin', changed)
  return true
}

/** token 失效以外的失败都记成 network，让云同步卡有话可说，而不是一片空白 */
async function noteFailure(status: number): Promise<void> {
  await setMeta(META.lastError, status === 401 ? 'unauthorized' : 'network')
}

export type SyncOutcome = 'skipped' | 'busy' | 'ok' | 'failed' | 'unauthorized'

let running = false

export async function syncNow(transport: Transport = httpTransport): Promise<SyncOutcome> {
  // 同步地占锁（在第一个 await 之前），否则两次并发调用会双双通过检查
  if (running) return 'busy'
  running = true
  try {
    const acc = await getAccount()
    if (!acc) {
      // 没登录：纯本地使用，一个请求都不发。顺手清掉 outbox——未登录是**默认状态**，
      // 只进不出会无界增长（约 20 行/天）。注册/登录时的 pushAll() 会把存量全推一遍，不会丢。
      await db.outbox.clear()
      return 'skipped'
    }

    await rescanOrphans() // 捞回"没有 uuid 也不在 outbox"的漏网行
    const pushed = await drainOutbox(transport, acc.token)
    if (!pushed.ok) {
      await noteFailure(pushed.status)
      // 401：token 已失效（改过密码 / 被清库）。返回专门的结果让排程停下来，
      // 而不是拿着废 token 按退避重试到天荒地老。
      return pushed.status === 401 ? 'unauthorized' : 'failed'
    }
    const pulled = await pullPages(transport, acc.token)
    if (!pulled.ok) {
      await noteFailure(pulled.status)
      return pulled.status === 401 ? 'unauthorized' : 'failed'
    }
    // 重算写回后必须在**本轮**再排空一次：否则 syncNow 返回 'ok' 时 outbox 里还躺着行，
    // 设置页会同时显示「同步完成 ✓」和「N 条待上传」，家长会以为同步坏了；
    // 其他设备也要多等一轮才看到收敛后的链条。
    if (await reconcileAndWriteBack()) {
      const again = await drainOutbox(transport, acc.token)
      if (!again.ok) {
        await noteFailure(again.status)
        return again.status === 401 ? 'unauthorized' : 'failed'
      }
    }
    await setMeta(META.lastSyncedAt, String(Date.now()))
    // 只有真的一条不剩才清 lastError；被隔离过记录时 drainOutbox 已写了 'rejected'，别抹掉
    if ((await getMeta(META.lastError)) !== 'rejected') await setMeta(META.lastError, '')
    return 'ok'
  } catch {
    // 静默：同步失败绝不打扰训练
    await noteFailure(0).catch(() => {})
    return 'failed'
  } finally {
    running = false
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
let attempt = 0
let started = false

/** 合并抖动：一节训练结束会连着入队多条，攒一下一次发走 */
function schedule(delay: number, transport: Transport): void {
  if (timer !== null) return
  timer = setTimeout(() => {
    timer = null
    void syncNow(transport).then((r) => {
      if (r === 'failed') {
        attempt += 1
        schedule(nextDelayMs(attempt), transport) // 指数退避，静默重试
      } else if (r === 'busy') {
        schedule(KICK_DELAY_MS, transport) // 上一轮还在跑：稍后再来，别丢掉这次触发
      } else if (r === 'ok') {
        attempt = 0
      }
      // r === 'unauthorized'：**刻意不排下一轮**。token 已废，重试没有意义；
      // 设置页会显示「登录已失效，请重新登录」，用户重新登录时 pushAll → kickSync 会重新启动。
      // r === 'skipped'：没登录，同样不必排下一轮（登录时会 kick）。
    })
  }, delay)
}

/**
 * 触发时机（spec §6.3）：
 *  - **应用启动**：本函数立刻排一次；
 *  - **单节训练完成**：saveSession / doCheckIn / syncBadges / captureMonster 入队后 kickSync；
 *  - **网络恢复**：online 事件。
 * 失败一律静默退避，永不打扰训练。
 *
 * ⚠️ 必须自我幂等并返回清理函数：`main.tsx` 用 `<StrictMode>`，dev 下 effect 会跑两次，
 * 否则 `window.addEventListener('online', …)` 会挂上两个不同闭包（无清理），
 * 热更新时还会不断叠加。今天靠 `schedule` 的 `timer !== null` 兜住了重复调度，
 * 但那层保护是隐式的——将来给 schedule 加个"立即执行"分支就会变成一次 online 触发两轮。
 */
export function startSync(transport: Transport = httpTransport): () => void {
  // 纯静态部署（VITE_BACKEND=off）没有 /api，引擎干脆不启动
  if (!SYNC_ENABLED || started) return () => {}
  started = true
  setKick(() => schedule(KICK_DELAY_MS, transport))
  const onOnline = (): void => {
    attempt = 0 // 网刚回来，立刻试一次，不要还按之前的退避等着
    schedule(0, transport)
  }
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline)
  schedule(0, transport)
  return () => {
    if (typeof window !== 'undefined') window.removeEventListener('online', onOnline)
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    started = false
  }
}
