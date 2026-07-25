/**
 * 极简固定窗口限速。计数存在 counters 表里（key 含窗口号，跨窗自然失效，
 * 无需定时清理）。对家庭规模的滥用防护够用，不引 Durable Objects。
 */
export function windowKey(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs)
}

export function overLimit(hits: number, max: number): boolean {
  return hits >= max
}

export const HOUR_MS = 3600_000
export const DAY_MS = 86400_000

/** 登录失败上限：同 email+IP 每小时 10 次（spec §9.3） */
export const LOGIN_FAIL_MAX = 10
/** 每 IP 每日注册上限（spec §9.2） */
export const REGISTER_PER_IP_MAX = 5
