/**
 * 限时挑战的节奏推导：把孩子实测的反应时间（sessions.avgReactionMs）折成"每题给多少时间"。
 *
 * ⚠️ 本文件是挑战全部可调数字的唯一出处，实测后只改这里。其中两条是**医学边界，不可动**：
 *   ① FASTEST_FACTOR_FLOOR = 1.3 —— 下限系数不得低于 1.3。avgReactionMs 是平均值、
 *      实际有波动，压到 ×1.05 会让约一半的题超时，那就是逼孩子瞎猜。
 *   ② MIN_FLIP_MS = 600 —— 翻拍过渡不得低于 600ms（设置页最快档，用户已认可的下限）。
 *      节拍快到来不及真翻拍，孩子就会干脆不翻，挑战退化成纯反应游戏并腐蚀主流程。
 *
 * ⚠️⚠️ 钳制只钳**基准**，绝不钳两个窗口。曾经的写法是给 initialMs / fastestMs 各加一个
 * 上限（4000 / 2500），那会在基准 ≥1924ms 时把最快窗口压回 基准×1.0 甚至更低——
 * 基准 2500ms 时窗口正好等于孩子自己的中位反应时间，约一半的题必超时，医学边界①被
 * 静默架空。而 avgReactionMs 记的是"视标出现→答对"，含透过 ±2.00D 拍子把模糊看清的
 * 时间，2000-2500ms 对刚开始练或累了的孩子完全现实，正好落在那个破口上。
 * 现在的口径：b = clamp(中位数, INITIAL_MIN_MS/INITIAL_FACTOR, BASELINE_MAX_MS)，
 * 两窗一律 b × 固定系数；低端把窗口抬高（FASTEST_MIN_MS）是安全方向，予以保留。
 *
 * 语义要点（spec §4.2）：这里算的是**答题窗口**（视标出现 → 必须答出），翻拍过渡是它之后
 * 的独立阶段，不计入窗口、也不被压缩。
 */

/** 总时长：30 秒（可控、不伤眼、有紧张感） */
export const CHALLENGE_DURATION_MS = 30_000
/** 基准取最近多少次训练 */
export const PACE_SAMPLE_N = 20
/** 少于这么多个有效样本就不自适应，走固定默认 */
export const MIN_SAMPLES = 3
/** 数据不足时的假定基准（= 1 秒，用户实测孩子约 1 秒或更快） */
export const DEFAULT_BASELINE_MS = 1000
/** 初始答题窗口 = 基准 × 此系数 */
export const INITIAL_FACTOR = 2.0
/** 最快答题窗口 = 基准 × 此系数 */
export const FASTEST_FACTOR = 1.3
/** 医学边界①：下限系数的硬地板，FASTEST_FACTOR 再怎么调都不得低于它 */
export const FASTEST_FACTOR_FLOOR = 1.3
/** 每多少题降一档 */
export const STEP_EVERY = 3
/** 一共几档到底 */
export const TIERS = 4
/** 初始窗口的地板（基准由它反推下限 = INITIAL_MIN_MS / INITIAL_FACTOR = 750ms） */
export const INITIAL_MIN_MS = 1500
/** 最快窗口的地板：把窗口**抬高**是安全方向，故保留 */
export const FASTEST_MIN_MS = 1000
/**
 * 基准的天花板：真孩子最慢也就 2-3 秒，超过即脏数据（走神/中途放下拍子/统计口径出错）。
 * 上限只该拦垃圾数据，**不许**改成给两个窗口封顶——那会压过下限系数、架空医学边界①。
 */
export const BASELINE_MAX_MS = 3000
/** 医学边界②：翻拍过渡时长的硬地板 */
export const MIN_FLIP_MS = 600

export interface Pace {
  /** 反应时间基准（中位数或数据不足时的默认值，**已钳到 [750, BASELINE_MAX_MS]**——即实际用于派生的那个值） */
  baselineMs: number
  /** 第一档答题窗口 */
  initialMs: number
  /** 最后一档答题窗口 */
  fastestMs: number
  /** 每降一档减少多少 */
  stepMs: number
  /** true=按实测数据推导，false=数据不足走固定默认 */
  adaptive: boolean
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** 中位数（自动过滤 0 与非法值；无有效值返回 null）。用中位数而非平均，避免个别走神的题拉偏 */
export function medianMs(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b)
  if (v.length === 0) return null
  const mid = v.length >> 1
  return v.length % 2 === 1 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

/**
 * 从反应时间列表推导节奏。
 * @param reactionMsList 调用方按**新→旧**传入（本函数只取前 PACE_SAMPLE_N 个）；
 *   写库时无反应数据会落 0（不是 undefined），故内部按 >0 过滤。
 */
export function derivePace(reactionMsList: number[]): Pace {
  const recent = reactionMsList.slice(0, PACE_SAMPLE_N)
  const valid = recent.filter((v) => Number.isFinite(v) && v > 0)
  const adaptive = valid.length >= MIN_SAMPLES
  const raw = adaptive ? (medianMs(valid) ?? DEFAULT_BASELINE_MS) : DEFAULT_BASELINE_MS

  // 钳制**只作用于基准**：低端保证初始窗口不低于 INITIAL_MIN_MS，高端只拦脏数据。
  // 两个窗口一律由基准按固定系数派生，故系数（含医学边界①）永远不会被上限压过。
  const baselineMs = clamp(raw, INITIAL_MIN_MS / INITIAL_FACTOR, BASELINE_MAX_MS)

  const initialMs = Math.round(baselineMs * INITIAL_FACTOR)
  const factor = Math.max(FASTEST_FACTOR, FASTEST_FACTOR_FLOOR) // 医学边界①
  // 只有下限（把窗口抬高=给孩子更多时间=安全方向）；**不许**再加上限。
  const fastestMs = Math.max(FASTEST_MIN_MS, Math.round(baselineMs * factor))
  const stepMs = Math.round((initialMs - fastestMs) / TIERS)

  return { baselineMs, initialMs, fastestMs, stepMs, adaptive }
}

/** 第 index 题（0 起）的答题窗口：每 STEP_EVERY 题降一档，TIERS 档到底，永不低于 fastestMs */
export function windowMsForIndex(pace: Pace, index: number): number {
  const tier = Math.min(TIERS, Math.floor(Math.max(0, index) / STEP_EVERY))
  return Math.max(pace.fastestMs, pace.initialMs - tier * pace.stepMs)
}

/**
 * 医学边界②的唯一出口：挑战用的翻拍过渡时长。
 * 对设置页的正常路径（600/900/1500）是恒等；它防的是手改 localStorage 与将来新增更快档。
 */
export function challengeFlipMs(settingMs: number | null | undefined): number {
  const v = Number(settingMs)
  if (!Number.isFinite(v)) return MIN_FLIP_MS
  return Math.max(MIN_FLIP_MS, Math.round(v))
}

/** 数据不足时的兜底节奏（也给 UI 在读库失败时直接用） */
export const DEFAULT_PACE: Pace = derivePace([])
