/**
 * 同步身份（uuid）与墓碑。设计见 spec §6.1。
 *
 * **7 类全部派生确定性 uuid**，形状 `kind:profileId:自然键`：
 *  - checkin 取 date、badge / monster 取 id（本地主键就是自然键）；
 *  - session / reward / redemption / exam 是 `++id` 自增表，**本地 id 不能当身份**
 *    （各设备独立编号），改用行内的写入时刻：startedAtMs+eye / createdAt / date+视力值。
 *
 * 为什么不用随机 uuid：随机 uuid 会让"同一条历史记录独立存在于两台设备"（两台都恢复过同一份
 * 备份、或两台各自跑过 v5→v6 迁移）在云端变成两行 → 另一台设备 pull 后**两行都插入本地** →
 * 当日答对数翻倍 → 积分 / CPM / 正确率 / 训练节数 / 勋章判定统统虚高。确定性 uuid 让两台算出
 * 同一个值，服务端 LWW 天然收敛成一行。
 *
 * profileId 必须编进 uuid：服务端 records 主键是 `(user_id, uuid)`，profile_id 只是普通列，
 * 不带这一维，3c 多档案上线后两个孩子会互相覆盖（而 uuid 上云后极难改）。
 */
export const KINDS = ['session', 'checkin', 'badge', 'monster', 'reward', 'redemption', 'exam'] as const
export type SyncKind = (typeof KINDS)[number]

/**
 * 本地主键**就是**自然键的三类。这个谓词只管两件事：payload 要不要剥 `id`、
 * 找本地行是 `table.get(key)` 还是 `where('uuid')`。**与"能否派生确定性 uuid"无关**（7 类都能）。
 */
export const KEYED_KINDS = ['checkin', 'badge', 'monster'] as const

export function isKeyedKind(kind: SyncKind): boolean {
  return (KEYED_KINDS as readonly string[]).includes(kind)
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}

/**
 * 行内可用的自然键。取不到（脏数据）返回 null → 降级为随机 uuid，
 * 绝不拼出 'session:default:undefined:undefined' 那种会让不相干的行互相撞车的值。
 */
export function naturalKeyOf(kind: SyncKind, row: Record<string, unknown>): string | null {
  switch (kind) {
    case 'checkin':
      return typeof row.date === 'string' && row.date.length > 0 ? row.date : null
    case 'badge':
    case 'monster':
      return typeof row.id === 'string' && row.id.length > 0 ? row.id : null
    case 'session': {
      const at = str(row.startedAtMs)
      const eye = typeof row.eye === 'string' && row.eye.length > 0 ? row.eye : null
      return at !== null && eye !== null ? `${at}:${eye}` : null
    }
    case 'reward':
    case 'redemption':
      return str(row.createdAt)
    case 'exam': {
      const d = typeof row.date === 'string' && row.date.length > 0 ? row.date : null
      const l = str(row.left)
      const r = str(row.right)
      return d !== null && l !== null && r !== null ? `${d}:${l}:${r}` : null
    }
  }
}

export function deterministicUuid(kind: SyncKind, profileId: string, naturalKey: string): string {
  return `${kind}:${profileId}:${naturalKey}`
}

/**
 * 从 uuid 反解自然键：墓碑 payload 只有 `{_deleted:true}`、没有自然键字段时用它找本地行。
 * 靠"自然键侧不含冒号"这一前提（date / badgeId / monsterId 都不含），故取最后一个 ':' 之后。
 * ⚠️ 只对 KEYED_KINDS 有意义；自增表一律按 uuid 索引查。
 */
export function naturalKeyFromUuid(uuid: string): string {
  return uuid.slice(uuid.lastIndexOf(':') + 1)
}

/**
 * uuid 生成器。**不能直接写 `crypto.randomUUID()`**：它要求 Safari 15.4+ **且安全上下文**，
 * 而 `npm run dev` 从 iPad 用局域网 IP（http）打开就不是安全上下文 → randomUUID 为 undefined →
 * v6 upgrade 抛错 → versionchange 事务回滚 → `db.open()` 每次都失败 → **整个 app 白屏**
 * （"iPad 白屏"正是最近一次提交刚修过的故障模式）。`getRandomValues` 在非安全上下文照常可用。
 */
export function newUuid(): string {
  const rnd = crypto.randomUUID
  if (typeof rnd === 'function') return rnd.call(crypto)
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 取一行的同步 uuid。已有 uuid 一律沿用——**不可重算**：重算会得到新 uuid，
 * 云端就会多出一条永远不再被更新的孤儿记录。
 */
export function recordUuid(
  kind: SyncKind,
  row: Record<string, unknown>,
  profileId: string,
  newId: () => string = newUuid,
): string {
  const existing = row.uuid
  if (typeof existing === 'string' && existing.length > 0) return existing
  const nk = naturalKeyOf(kind, row)
  return nk !== null ? deterministicUuid(kind, profileId, nk) : newId()
}

/** 墓碑 payload：删除靠它跨设备传播（spec §6.1） */
export const TOMBSTONE = { _deleted: true } as const

export function isTombstone(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false
  return (payload as Record<string, unknown>)._deleted === true
}

/**
 * 本地行 → 可上云的 payload。自增主键表**必须剥掉本地 `id`**：
 * 那是各设备独立自增的号，带过去会让另一台设备按别人的 id 落库、覆盖掉自己不相干的行。
 * KEYED 表的主键（date / id）是跨设备一致的语义键，必须保留。
 */
export function toPayload(kind: SyncKind, row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row }
  if (!isKeyedKind(kind)) delete out.id
  return out
}

/** 允许的本地时钟超前量。服务端上限是 24 小时，这里留一半余量 */
export const MAX_FUTURE_MS = 12 * 3600_000

/**
 * 入队时钳制 updatedAt。**这一条是"同步链被一条毒药记录永久堵死"的唯一防线。**
 *
 * 服务端 `validatePushRecords` 拒收超前 24 小时的 updatedAt，而且校验是**整批全或无**：
 * 一批里只要有一条非法，整批 400。孩子的 iPad 系统时间被调快是很现实的事——那些行一入队
 * 就是"未来时间戳"，即使家长后来把时钟改回去，outbox 里的值也不会变，同步从此永久失败
 * （而失败是静默的，家长只看到"N 条待上传"一直涨）。
 * 从源头钳掉比在推送侧补救便宜得多。
 */
export function clampUpdatedAt(updatedAt: number, nowMs: number): number {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return nowMs
  return updatedAt > nowMs + MAX_FUTURE_MS ? nowMs : updatedAt
}
