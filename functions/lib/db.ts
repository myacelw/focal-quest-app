import { windowKey } from './ratelimit'

export interface Env {
  DB: D1Database
  /** 站长开局用的一次性引导码；站长注册完成后应删除此 secret（见计划人工前置 P2） */
  BOOTSTRAP_INVITE_CODE?: string
}

/** UTC 日期串，仅用于 counters 的粗粒度趋势（不参与业务逻辑） */
export function utcDate(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10)
}

/** 按日计数自增，用于滥用监控与管理后台统计 */
export async function bumpCounter(env: Env, metric: string, nowMs = Date.now()): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO counters (date, metric, value) VALUES (?, ?, 1)
     ON CONFLICT(date, metric) DO UPDATE SET value = value + 1`,
  ).bind(utcDate(nowMs), metric).run()
}

/**
 * 限速计数用的 metric key。**读与写必须共用这一个函数**——登录接口要"先读计数判超限、
 * 只在失败时自增"，两处若各自拼字符串，格式一旦微调就会静默失配（限速形同失效）。
 */
export function rateLimitMetric(scope: string, windowMs: number, nowMs: number): string {
  return `rl.${scope}.${windowKey(nowMs, windowMs)}`
}

/** 读当前窗口的命中次数（不自增） */
export async function readRateLimit(env: Env, scope: string, windowMs: number, nowMs = Date.now()): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT value FROM counters WHERE date = ? AND metric = ?`,
  ).bind(utcDate(nowMs), rateLimitMetric(scope, windowMs, nowMs)).first<{ value: number }>()
  return row?.value ?? 0
}

/**
 * 固定窗口限速自增：把窗口号编进 metric key，跨窗自然失效、无需清理。
 * 返回本次自增后的命中次数。
 */
export async function hitRateLimit(env: Env, scope: string, windowMs: number, nowMs = Date.now()): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO counters (date, metric, value) VALUES (?, ?, 1)
     ON CONFLICT(date, metric) DO UPDATE SET value = value + 1
     RETURNING value`,
  ).bind(utcDate(nowMs), rateLimitMetric(scope, windowMs, nowMs)).first<{ value: number }>()
  return row?.value ?? 1
}
