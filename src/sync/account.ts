import { db } from '../data/db'
import { deriveAuthKey, normalizeEmail } from './authkey'
import { pushAll } from '../data/api'

/**
 * 账号与同步元数据。存 Dexie 的 syncMeta 表（spec §6.2）而不是 localStorage：
 *  ① restoreBackup() 覆盖 7 张业务表时不会波及登录态；
 *  ② 备份文件收集所有 fzp.* localStorage 键，放 localStorage 会让备份夹带会话令牌。
 */
export interface Account {
  userId: string
  email: string
  token: string
  inviteCode: string
  isAdmin: boolean
}

/** syncMeta 键名常量：读写两侧共用，避免两处拼字符串、格式一改就静默失配 */
export const META = {
  token: 'token',
  email: 'email',
  userId: 'userId',
  inviteCode: 'inviteCode',
  isAdmin: 'isAdmin',
  /** 本机业务数据"属于"哪个账号。**退出登录时刻意不清**——它是跨账号串账的唯一防线 */
  boundUserId: 'boundUserId',
  lastPulledSeq: 'lastPulledSeq',
  lastSyncedAt: 'lastSyncedAt',
  lastError: 'lastError',
} as const

const TEST_MODE = import.meta.env.MODE === 'test'

export async function getMeta(key: string): Promise<string | null> {
  const row = await db.syncMeta.get(key)
  return row?.value ?? null
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.syncMeta.put({ key, value })
}

export async function getAccount(): Promise<Account | null> {
  const [token, email, userId, inviteCode, isAdmin] = await Promise.all([
    getMeta(META.token), getMeta(META.email), getMeta(META.userId),
    getMeta(META.inviteCode), getMeta(META.isAdmin),
  ])
  if (!token || !userId) return null
  return { token, userId, email: email ?? '', inviteCode: inviteCode ?? '', isAdmin: isAdmin === '1' }
}

export async function saveAccount(a: Account): Promise<void> {
  await db.syncMeta.bulkPut([
    { key: META.token, value: a.token },
    { key: META.email, value: a.email },
    { key: META.userId, value: a.userId },
    { key: META.inviteCode, value: a.inviteCode },
    { key: META.isAdmin, value: a.isAdmin ? '1' : '0' },
    // 记下本机数据归属，供下一次登录判断"是不是换了另一个账号"
    { key: META.boundUserId, value: a.userId },
  ])
}

/**
 * 退出登录。除账号本身，还必须清：
 *  - lastPulledSeq：换账号登录若续用上一个账号的游标，会从半路开始拉、漏掉全部历史；
 *  - outbox 里 **op='put'** 的行：未推送的本地写不该串进另一个账号
 *    （重新登录时 pushAll 会从 7 张表全量再入队，不会丢）。
 *
 * ⚠️ 两样**刻意不清**：
 *  - **op='delete' 的墓碑**：`pushAll()` 是从 7 张表读现存行，**重建不出墓碑**——本地行已经
 *    真删了。清掉就等于永久丢掉删除意图：A 删的验光记录永远不在 B 消失；A 重新登录时从
 *    seq 0 拉，云端那条（仍是正常 payload）会被 mergeRecord(local=null) → put 写回本地，
 *    正是 spec §6.1 明说要防的"被复活"。墓碑只带 uuid，不含任何业务内容，不构成跨账号泄漏。
 *  - **boundUserId**：它是跨账号串账的唯一防线，清了这道检查就永久失效。
 *
 * 业务数据一律**不动**——退出登录只是断开云端，本地照常练。
 */
export async function clearAccount(): Promise<void> {
  await db.syncMeta.bulkDelete([
    META.token, META.email, META.userId, META.inviteCode, META.isAdmin,
    META.lastPulledSeq, META.lastSyncedAt, META.lastError,
  ])
  const putIds = (await db.outbox.toArray())
    .filter((r) => r.op === 'put' && r.id !== undefined)
    .map((r) => r.id as number)
  await db.outbox.bulkDelete(putIds)
}

export async function getLastPulledSeq(): Promise<number> {
  const n = Number(await getMeta(META.lastPulledSeq))
  // 脏值降级为 0：宁可重拉一遍（服务端幂等、合并是 LWW），也不能跳过历史
  return Number.isFinite(n) && n > 0 ? n : 0
}

export async function setLastPulledSeq(n: number): Promise<void> {
  await setMeta(META.lastPulledSeq, String(n))
}

/** 服务端错误码（3b-1 已固定）→ i18n key；未知码兜底成网络错误，不显示空白 */
export function authErrorKey(code: string): string {
  const MAP: Record<string, string> = {
    bad_email: 'sync.err.badEmail',
    bad_auth_key: 'sync.err.badPassword',
    bad_invite_code: 'sync.err.badInvite',
    invite_quota_exhausted: 'sync.err.inviteUsedUp',
    email_taken: 'sync.err.emailTaken',
    bad_credentials: 'sync.err.badCredentials',
    too_many_requests: 'sync.err.tooMany',
    retry: 'sync.err.retry',
    storage_quota_exceeded: 'sync.err.quota',
    unauthorized: 'sync.err.unauthorized',
  }
  return MAP[code] ?? 'sync.err.network'
}

/**
 * 登录成功后，本机既有业务数据要不要全量并入这个账号？纯函数，方便单测锚定。
 *
 * spec §6.3 只允许"先离线练了再登录 → 本地数据并入该账号"，并明示"不做跨账号历史合并"。
 * 无条件 pushAll 会造成**跨账号串账**：A 账号退出（业务数据一条不动）、B 账号登入后，
 * A 家孩子几个月的训练与验光记录会静默进入 B 的云端，而一期既无自助删号也无删记录 UI，
 * **不可撤回**。借设备给亲友、家长自己试注册第二个账号，都会踩到。
 */
export function mergeDecision(p: {
  isRegister: boolean
  boundUserId: string | null
  newUserId: string
  localRows: number
}): 'push' | 'ask' | 'skip' {
  if (p.isRegister) return 'push'                       // 新号：这台设备的数据本来就是它的
  if (p.boundUserId === null || p.boundUserId === '') return 'push' // 从未绑定过
  if (p.boundUserId === p.newUserId) return 'push'      // 还是同一个账号
  return p.localRows > 0 ? 'ask' : 'push'              // 换了账号：有数据就先问，空库无所谓
}

/** 本机 7 张业务表的总行数（只用来判断"有没有数据可串"，不必精确到某表） */
export async function countLocalRows(): Promise<number> {
  const counts = await Promise.all([
    db.sessions.count(), db.checkins.count(), db.badges.count(), db.monsters.count(),
    db.rewards.count(), db.redemptions.count(), db.exams.count(),
  ])
  return counts.reduce((a, b) => a + b, 0)
}

export type AuthResult = { ok: true; account: Account } | { ok: false; errorKey: string }

export interface AuthOptions {
  /**
   * 本机已有**另一个**账号的数据时询问是否并入；返回 false 就跳过全量上推、只做拉取。
   * 不传则按"不并入"处理——更安全的默认值（宁可少传一次，也不能把别家孩子的记录传上去）。
   */
  confirmMerge?: (localRows: number) => Promise<boolean>
}

interface AuthBody {
  email: string
  authKey: string
  inviteCode?: string
}
interface AuthResponse {
  token?: string
  userId?: string
  inviteCode?: string
  isAdmin?: boolean
  error?: string
}

/**
 * 注册/登录共用路径。成功后保存账号并**全量入队**（spec §6.4：存量数据上云）。
 * 单测里直接短路：既不发网络，也不白跑 31 万次 PBKDF2。
 */
async function auth(
  path: '/auth/register' | '/auth/login',
  email: string,
  password: string,
  inviteCode?: string,
  opts: AuthOptions = {},
): Promise<AuthResult> {
  if (TEST_MODE) return { ok: false, errorKey: 'sync.err.network' }
  const norm = normalizeEmail(email)
  try {
    const body: AuthBody = { email: norm, authKey: await deriveAuthKey(norm, password) }
    if (inviteCode !== undefined) body.inviteCode = inviteCode
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => null)) as AuthResponse | null
    if (!res.ok || !data?.token || !data.userId) {
      return { ok: false, errorKey: authErrorKey(String(data?.error ?? '')) }
    }
    const account: Account = {
      token: data.token,
      userId: data.userId,
      email: norm,
      inviteCode: data.inviteCode ?? '',
      isAdmin: data.isAdmin === true,
    }
    // ⚠️ 先在 saveAccount 覆盖 boundUserId **之前**读它，否则永远判不出"换了账号"
    const bound = await getMeta(META.boundUserId)
    const decision = mergeDecision({
      isRegister: path === '/auth/register',
      boundUserId: bound,
      newUserId: account.userId,
      localRows: await countLocalRows(),
    })
    await saveAccount(account)
    // 换账号/新登录都从 0 开始拉，保证拿到该账号的全部历史
    await setLastPulledSeq(0)

    const merge = decision === 'push'
      ? true
      : decision === 'ask'
        ? await (opts.confirmMerge?.(await countLocalRows()) ?? Promise.resolve(false))
        : false
    if (merge) await pushAll()
    return { ok: true, account }
  } catch {
    return { ok: false, errorKey: 'sync.err.network' }
  }
}

export function registerAccount(email: string, password: string, inviteCode: string): Promise<AuthResult> {
  return auth('/auth/register', email, password, inviteCode)
}

export function loginAccount(email: string, password: string, opts?: AuthOptions): Promise<AuthResult> {
  return auth('/auth/login', email, password, undefined, opts)
}
