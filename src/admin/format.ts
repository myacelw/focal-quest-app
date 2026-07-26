/**
 * 管理后台的展示层纯函数。
 *
 * 组件本身没法单测（vitest 跑 node 环境、项目没装 jsdom），所以凡是"会写错"的
 * 映射与格式化全放这里，AdminPage.tsx 只剩 JSX。
 */

/** counters 里会出现的固定 metric（动态的一族是 push.reject.<reason>，另行处理） */
const KNOWN_METRICS = new Set([
  'register.ok', 'register.badcode', 'register.ratelimit', 'register.quotaexhausted',
  'login.ok', 'login.fail', 'login.ratelimit',
  'push.ok', 'active.user',
])

const PUSH_REJECT_PREFIX = 'push.reject.'

const KIND_KEYS = new Set([
  'session', 'checkin', 'badge', 'monster', 'reward', 'redemption', 'exam',
])

export interface MetricLabel {
  key: string
  params?: { reason: string }
}

/**
 * metric → i18n 键。返回 null 表示"没有专属文案"，界面直接显示原始 metric——
 * 将来后端加了新计数，后台会**显示**它而不是静默丢掉。
 */
export function metricLabel(metric: string): MetricLabel | null {
  if (KNOWN_METRICS.has(metric)) return { key: `admin.metric.${metric}` }
  if (metric.startsWith(PUSH_REJECT_PREFIX)) {
    return { key: 'admin.metric.pushReject', params: { reason: metric.slice(PUSH_REJECT_PREFIX.length) } }
  }
  return null
}

export function kindLabelKey(kind: string): string | null {
  return KIND_KEYS.has(kind) ? `admin.kind.${kind}` : null
}

/** '2026-07-26' → '07-26'；形状不对就原样返回（脏数据不该让后台白屏） */
export function shortDate(date: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(5) : date
}

/**
 * 服务端 `ADMIN_TZ_OFFSET_MS` 的**镜像**：分日一律按东八区。
 * 改一侧必须改另一侧，否则"注册日期"与曲线的分日键会差一天。
 */
const TZ_OFFSET_MS = 8 * 3_600_000

/** 毫秒 → 东八区 'YYYY-MM-DD'，与服务端 tzDate 同口径 */
export function isoDate(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  return new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 10)
}
