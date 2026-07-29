import { getAccount, setMeta, META, authErrorKey } from './account'

export interface InviteState {
  inviteCode: string
  used: number
  quota: number
  isAdmin: boolean
}

export type InviteResult =
  | { ok: true; state: InviteState }
  | { ok: false; errorKey: string }

/**
 * 把服务端的权威值写回 syncMeta。
 *
 * ⚠️ **只在成功响应时调用。** 离线时若把 isAdmin 清成 '0'，管理后台入口会凭空消失，
 * 而家长完全看不出是断网导致的——这台设备从此"不是管理员"，直到重新登录。
 */
async function persist(state: InviteState): Promise<void> {
  await setMeta(META.inviteCode, state.inviteCode)
  await setMeta(META.isAdmin, state.isAdmin ? '1' : '0')
}

/** GET 读状态 / POST 换码，两者响应形状相同，故共用这一条路径 */
async function call(method: 'GET' | 'POST'): Promise<InviteResult> {
  const acc = await getAccount()
  if (acc === null) return { ok: false, errorKey: 'sync.err.unauthorized' }
  try {
    const res = await fetch('/api/account/invite', {
      method,
      headers: { Authorization: `Bearer ${acc.token}` },
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      return { ok: false, errorKey: authErrorKey(String(body?.error ?? '')) }
    }
    const state = (await res.json()) as InviteState
    await persist(state)
    return { ok: true, state }
  } catch {
    return { ok: false, errorKey: 'sync.err.network' }
  }
}

/** 读自己的邀请码、已用数与额度。失败时调用方应保留 syncMeta 里的快照码，不要清空。 */
export const fetchInviteState = (): Promise<InviteResult> => call('GET')

/** 换一个新码（仅管理员；非管理员会拿到 sync.err.forbidden） */
export const rotateInviteCode = (): Promise<InviteResult> => call('POST')
