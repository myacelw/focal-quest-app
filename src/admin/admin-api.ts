import { getAccount } from '../sync/account'

/**
 * ⚠️ 下面这组类型是 `functions/lib/admin-stats.ts` 的**镜像**。
 * 两侧 tsconfig 独立（functions 的 lib 不含 DOM，主 tsconfig 又 exclude 了 functions），
 * 无法 import 同一份声明，只能人工保持一致——改服务端结构时**必须同步改这里**。
 */
export interface DailyCount { date: string; count: number }
export interface KindCount {
  kind: string
  count: number
  /** 近 7 天新增条数（spec §8 的"增速"） */
  recent: number
}
export interface RecentUser {
  email: string
  createdAt: number
  invitedByEmail: string | null
  isAdmin: boolean
}
export interface InviterRow {
  email: string
  /** 历史累计邀请人数（跨所有世代的码） */
  invited: number
  quota: number
  /** **当前这个码**已用掉的名额（invite_reset_at 之后注册的人） */
  currentUsed: number
}
export interface AbuseRow { metric: string; total: number }

export interface AdminStats {
  generatedAt: number
  /** tokens = 近 30 天有活动的令牌数（不是累计签发数，见服务端注释） */
  totals: { users: number; records: number; tokens: number }
  kinds: KindCount[]
  active: { dau: number; wau: number; mau: number; openDau: number; openWau: number; openMau: number }
  daily: DailyCount[]
  recentUsers: RecentUser[]
  inviters: InviterRow[]
  abuse: AbuseRow[]
}

export type AdminStatsResult =
  | { ok: true; stats: AdminStats }
  | { ok: false; errorKey: string }

/**
 * 拉管理后台统计。编排层保持极薄（碰 fetch，不写单测；可测逻辑都在 format.ts）。
 * 任何失败都只返回一个 i18n 键——后台读不到数据是小事，绝不能影响训练。
 */
export async function fetchAdminStats(): Promise<AdminStatsResult> {
  const acc = await getAccount()
  if (!acc) return { ok: false, errorKey: 'admin.denied' }
  try {
    const res = await fetch('/api/admin/stats', {
      headers: { Authorization: `Bearer ${acc.token}` },
    })
    // 401（token 失效）与 403（不是管理员）对使用者是同一句话：重新登录，或者你没权限
    if (res.status === 401 || res.status === 403) return { ok: false, errorKey: 'admin.denied' }
    if (!res.ok) return { ok: false, errorKey: 'admin.error' }
    return { ok: true, stats: (await res.json()) as AdminStats }
  } catch {
    return { ok: false, errorKey: 'admin.error' }
  }
}
