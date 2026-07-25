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

/*
 * 注册限速刻意分成两个独立计数，而不是"成败一起算一个日额度"：
 *
 * 家长常要手抄或电话口述邀请码，输错几次是常态。若失败也吃日额度，抄错几次的人
 * 当天就再也注册不了了——把正常用户锁在门外一整天，代价远大于防住的滥用。
 * 拆开后：成功建号按日限（挡批量建号），失败尝试按小时限（挡暴力猜码，且一小时后自愈）。
 */
/** 成功注册上限：每 IP 每日 20 次（家庭最多注册两三个，20 只挡脚本批量建号） */
export const REGISTER_OK_PER_IP_MAX = 20
/** 注册失败上限：每 IP 每小时 10 次（挡暴力猜邀请码；正常人抄错几次不受影响） */
export const REGISTER_FAIL_PER_IP_MAX = 10
