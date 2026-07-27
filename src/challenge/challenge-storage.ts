import { lsGet, lsSet } from '../data/storage'

/**
 * 挑战最高分只存 localStorage，**不进 Dexie、不同步**（spec §5）。
 *
 * 为什么不落库：若塞进 sessions 表加个 mode 字段，所有统计查询（aggregate / period /
 * weekly-report / 勋章判定 deriveStats / 首页 getHomeStats）都必须记得过滤挑战行——
 * 漏一处就污染趋势图。挑战数据的价值远不值这个风险。
 * 代价：换设备丢最高分（可接受；且 backup-service 按 fzp. 前缀会把它带进 JSON 备份）。
 */
export const CHALLENGE_BEST_KEY = 'fzp.challengeBest'

/** 原始值 → 分数；缺失/脏数据/负数都归 0，小数向下取整 */
export function parseBest(raw: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

/** 纯判定：给定旧原始值与本局分数，算出新纪录与是否破纪录（平纪录与 0 分都不算破） */
export function bestAfter(prevRaw: string | null, score: number): { best: number; isNewRecord: boolean } {
  const prev = parseBest(prevRaw)
  const s = Number.isFinite(score) && score > 0 ? Math.floor(score) : 0
  return s > prev ? { best: s, isNewRecord: true } : { best: prev, isNewRecord: false }
}

export function readBest(): number {
  return parseBest(lsGet(CHALLENGE_BEST_KEY))
}

/** 破纪录才写；返回结果给结算页决定是否放「🎉 新纪录！」 */
export function writeBestIfHigher(score: number): { best: number; isNewRecord: boolean } {
  const r = bestAfter(lsGet(CHALLENGE_BEST_KEY), score)
  if (r.isNewRecord) lsSet(CHALLENGE_BEST_KEY, String(r.best))
  return r
}
