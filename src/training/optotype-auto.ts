import type { SessionRow } from '../data/db'
import { lsGet, lsSet } from '../data/storage'

/**
 * 视标自适应——按训练表现自动收紧视标，并在调过头时自愈回退（spec 2026-07-29）。
 *
 * 为什么不只看正确率：调节灵敏度训练的刺激来自**拍子的 ±2.00D**，与视标大小无关，
 * 所以正确率高恰恰说明她成功清晰化了、那正是训练目的。真正的疗效指标是**清晰化所需
 * 时间**。视标大小决定的是"看清"这个判据严不严——偏大时孩子还没完全调节到位就已经
 * 认得出方向，"清晰"被提前判定、强度打折。
 *
 * 实证：她 07-11 正确率 95%、07-18 正确率 96%，都能过现有周报那道"≥90%"的门，
 * 但当天中位反应是 4024ms 与 4341ms——答得对但很吃力，那时候调小视标是帮倒忙。
 * 所以必须两个信号同时成立。
 *
 * ⚠️ 本模块**只朝"变难"方向调**。要放松只能家长手动——自动调大等于给孩子一条
 * 把训练调水的通道，与"把视标大小折叠进家长区"那个决定直接冲突。
 */

/** 判定窗口：最近几个**训练日** */
export const AUTO_WINDOW_DAYS = 3
/** 窗口内每天的正确率都要达到 */
export const AUTO_MIN_ACCURACY = 0.95
/** 窗口的「日中位数的中位数」要低于 */
export const AUTO_MAX_REACTION_MS = 2000
/**
 * 距上次调整至少要再练满几个训练日。
 * ⚠️ **必须 ≥ AUTO_WINDOW_DAYS**，这是一条承重的隐性不变量（由下面的
 * `AUTO_COOLDOWN_DAYS >= AUTO_WINDOW_DAYS` 测试锚定，别只改常量不看这条注释）：
 * `since >= AUTO_COOLDOWN_DAYS` 通过时，判定窗口（从 `todayIdx - AUTO_WINDOW_DAYS + 1`
 * 起）天然不会跨过上一次调整点，收紧判据因此永远只看"当前这个视标尺寸下"的数据。
 * 若把这个值调小于窗口天数（比如觉得收紧太慢想调成 2），窗口会混进一个更大视标下
 * 练出来的轻松日，收紧会在证据不足的情况下被加速触发。
 */
export const AUTO_COOLDOWN_DAYS = 3
/** 一次调一档（与设置页滑块步进一致） */
export const AUTO_STEP_MM = 0.1

/**
 * 自动收紧的医学下限。40cm 下 0.6mm ≈ 等效视力 0.97，即正常视力上限。
 * 再往下她就是**受自己视力限制而不是受调节能力限制**，训练退化成猜。
 * ⚠️ 这是按通用值定的——`src/exams` 里一条验光记录都没有。
 * 有实测矫正视力后应按它复核本值。手动滑块仍可到 SIZE_MIN_MM，下限只约束自动逻辑。
 */
export const AUTO_FLOOR_MM = 0.6

/** 回退：观察日正确率低于此值即算该天破线 */
export const REVERT_MIN_ACCURACY = 0.85
/** 回退：观察日中位反应超过「调整前基线 × 此系数」即算该天破线 */
export const REVERT_REACTION_FACTOR = 1.5
/** 回退后的长冷却（训练日），防止调下去→退回来→再调下去来回震荡 */
export const REVERT_COOLDOWN_DAYS = 10

/** 设置页滑块的范围与默认值，sanitizeSizeMm 按它钳制 */
export const SIZE_MIN_MM = 0.3
export const SIZE_MAX_MM = 2
export const DEFAULT_SIZE_MM = 1

export const LS_SIZE = 'fzp.optotypeSizeMm'
export const LS_LAST_ADJUST = 'fzp.optotypeLastAdjust'
export const LS_AUTO_ENABLED = 'fzp.optotypeAuto'

export interface OptotypeAdjust {
  from: number
  to: number
  /** 调整发生的**训练日**（YYYY-MM-DD） */
  atDate: string
  kind: 'tighten' | 'revert' | 'manual'
  /** 收紧时记下调整前窗口的中位反应；回退判据要拿它做基线。manual/revert 置 0 */
  baselineReactionMs: number
}

export type AdjustDecision =
  | { action: 'none' }
  | { action: 'tighten'; from: number; to: number; baselineReactionMs: number }
  | { action: 'revert'; from: number; to: number }

/**
 * 把脏 localStorage 值钳成可用毫米数——**三个读取点的唯一出口**。
 *
 * 原先 ChallengePage / SettingsPage / TrainingPage 各写一份裸 `Number(...)`：
 * `Number('abc')` 是 NaN，训练页 `heightPx = NaN × pxPerMm` 会让视标直接渲染不出来。
 * 与 goal.ts 的 sanitizeDurationSec 是同一类问题、同一种处理。本迭代要程序化写入
 * 这个键，脏值后果更严重，故收口。
 */
export function sanitizeSizeMm(mm: number): number {
  if (!Number.isFinite(mm) || mm <= 0) return DEFAULT_SIZE_MM
  const clamped = Math.min(Math.max(mm, SIZE_MIN_MM), SIZE_MAX_MM)
  // 步进是 0.1，浮点减法会留下 0.7999999999 这种毛刺，落库/显示前统一收敛到一位小数
  return Math.round(clamped * 10) / 10
}

export function readSizeMm(): number {
  const v = lsGet(LS_SIZE)
  return sanitizeSizeMm(v === null ? NaN : Number(v))
}

/**
 * 已到自动收紧的下限（再调一档就会低于 `AUTO_FLOOR_MM`）。
 *
 * ⚠️ 那个 `- 1e-9` 是必须的：`0.7 - 0.1` 在浮点下是 `0.5999999999999999`，
 * 去掉余量会让 0.7 这一档被误判成"已到下限"，自动收紧永远停在 0.7、到不了 0.6。
 *
 * 抽成谓词是因为周报文案也要判"已到最小档"——两处各写一份浮点比较必然漂移。
 */
export function atAutoFloor(mm: number): boolean {
  return mm - AUTO_STEP_MM < AUTO_FLOOR_MM - 1e-9
}

/** 周报文案要按这三态分别措辞，否则"视标会自动调小"在后两种情形下是假话 */
export type OptotypeAutoState = 'auto' | 'manual' | 'floor'

/** 从 localStorage 读出当前的自适应状态。已到下限时无论开关如何都是 'floor' */
export function readOptotypeAutoState(): OptotypeAutoState {
  if (atAutoFloor(readSizeMm())) return 'floor'
  return readAutoEnabled() ? 'auto' : 'manual'
}

export function readAutoEnabled(): boolean {
  // 默认开（没写过这个键时）：用户选的就是"自动调、事后告知"。
  //
  // ⚠️ 严格白名单，不用 `!== '0'`：那种写法会把 'false' / 'off' / 'no' 这类
  // 手工写入的值当成"开"，而写这些字的人显然想关。这个开关是"会自己改动医学参数
  // 的功能"的唯一急停闸门，宁可在含糊时判为关（更保守的那一侧）。
  const v = lsGet(LS_AUTO_ENABLED)
  return v === null || v === '1'
}

export function writeAutoEnabled(on: boolean): void {
  lsSet(LS_AUTO_ENABLED, on ? '1' : '0')
}

export function readLastAdjust(): OptotypeAdjust | null {
  const raw = lsGet(LS_LAST_ADJUST)
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Partial<OptotypeAdjust>
    if (typeof o.from !== 'number' || typeof o.to !== 'number' || typeof o.atDate !== 'string') return null
    if (o.kind !== 'tighten' && o.kind !== 'revert' && o.kind !== 'manual') return null
    return {
      from: sanitizeSizeMm(o.from),
      to: sanitizeSizeMm(o.to),
      atDate: o.atDate,
      kind: o.kind,
      baselineReactionMs: Number.isFinite(o.baselineReactionMs) ? Number(o.baselineReactionMs) : 0,
    }
  } catch {
    // 手工改坏了就当没有——丢一条审计记录远好于让训练页崩掉
    return null
  }
}

export function writeLastAdjust(a: OptotypeAdjust): void {
  lsSet(LS_LAST_ADJUST, JSON.stringify(a))
}

/** 一天的聚合：正确率 + 该天所有节次反应的中位数 */
interface DayStat { date: string; accuracy: number; medianMs: number }

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * 把 sessions 折成按日期升序的每日统计。
 *
 * ⚠️ 口径：**先按天取中位、再对天取中位**（下面 windowMedian），不是把所有节次
 * 混在一起——单节异常（如她 07-26 那节 4916ms）不该带偏整天。
 * ⚠️ 口径：缺 avgReactionMs 的节次不计入；整天都缺则该天不算有效训练日。
 * ⚠️ 口径：**不看是否打卡、不看门槛是否达标**。与 goal.ts 那条「门槛只决定今天算不算
 * 完成，不决定训练事实是否被记录」一致——她 07-13 那天没打卡但有 5 节有效数据。
 * ⚠️ 口径：`avgReactionMs === 0` 不计入。0 是本仓「这一节没有反应数据」的哨兵值，不是
 * 「0 毫秒反应」——`TrainingPage.tsx` 零个答对时落库 `0`（不是 undefined），`weekly-report.ts`
 * 与 `challenge-pace.ts` 都按 `>0` 过滤同一个哨兵。若把 0 当真实反应时间计入中位数，
 * 孩子被叫去吃饭、那一节挂机走满时会在该天中位数里掺进一个「0ms 反应」，把整天的中位
 * 数腰斩，误判成「答得又快又准」。
 */
export function dayStats(sessions: readonly SessionRow[]): DayStat[] {
  const byDate = new Map<string, { answered: number; correct: number; ms: number[] }>()
  for (const s of sessions) {
    let d = byDate.get(s.date)
    if (!d) { d = { answered: 0, correct: 0, ms: [] }; byDate.set(s.date, d) }
    d.answered += s.answered
    d.correct += s.correct
    if (typeof s.avgReactionMs === 'number' && Number.isFinite(s.avgReactionMs) && s.avgReactionMs > 0) d.ms.push(s.avgReactionMs)
  }
  return [...byDate.entries()]
    .filter(([, d]) => d.ms.length > 0 && d.answered > 0)
    .map(([date, d]) => ({ date, accuracy: d.correct / d.answered, medianMs: median(d.ms) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** 该天是否"破线"（回退判据）：正确率塌了，或清晰化明显变吃力 */
function breached(d: DayStat, baselineMs: number): boolean {
  return d.accuracy < REVERT_MIN_ACCURACY || d.medianMs > baselineMs * REVERT_REACTION_FACTOR
}

/**
 * 判定今天要不要调视标。纯函数——不读 localStorage、不写任何东西。
 *
 * ⚠️ 三条写死的口径：
 *  ① 窗口/冷却/观察期一律按**训练日序号**算差值，不碰自然日。她出去玩 4 天，
 *    按自然日算冷却会白白流逝，窗口还会跨过断档去比两周前的数据。
 *  ② **回退判据优先于收紧判据**。顺序反了的话，刚回退完可能立刻又满足收紧条件。
 *  ③ **currentMm 是唯一真相**，last 只用于冷却与观察期。备份恢复/手工改键导致
 *    currentMm !== last.to 时，照 currentMm 往下算，不纠正、不报错。
 */
export function decideOptotypeAdjust(
  sessions: readonly SessionRow[],
  currentMm: number,
  last: OptotypeAdjust | null,
  todayStr: string,
): AdjustDecision {
  const days = dayStats(sessions)
  const todayIdx = days.findIndex((d) => d.date === todayStr)
  if (todayIdx < 0) return { action: 'none' }          // 今天没有有效数据
  const mm = sanitizeSizeMm(currentMm)

  // ⚠️ 用日期比较而不是「在 days 里找 last.atDate 的下标再作差」：manual 记录的 atDate 是
  // 家长改设置那天（SettingsPage 用 new Date()），**未必是训练日**。找不到下标时旧写法
  // 会得到 since = Infinity、冷却被静默放行——家长周日刚把视标调大，周一训练完就被自动
  // 压回去，设计 §3.4「手动优先」在最典型的场景下完全失效。resetTrainingData / 备份恢复
  // 换掉 sessions 后也会踩同一个洞，连自愈观察期一起失效。
  const sinceDays = last ? days.filter((d) => d.date > last.atDate && d.date <= todayStr) : []
  const since = last ? sinceDays.length : Infinity

  // ── ② 回退优先 ──────────────────────────────────────────────
  if (last && last.kind === 'tighten') {
    const observed = sinceDays
    // ⚠️ 必须是 === 2（而非 >=2）：观察期只在收紧后第 2 个训练日当天判一次。用 >=2
    // 的话，开关关闭、家长没点应用时，这个判断会在之后每一天都重新算出同一个 true
    // （observed 的前两个元素是固定的两天），"建议退回一档"的卡片会永久粘住，
    // 而回退分支又永远抢在收紧分支前 return，导致收紧逻辑从此再也跑不到。
    if (observed.length === 2) {
      const [a, b] = observed
      // ⚠️ **两天都破线**才回退，不是任一天。07-18 那个 22:43 开练的孤立疲劳日
      // （4341ms）若能单独触发回退，会把之后 4 个训练日全锁进 10 天长冷却。
      if (breached(a, last.baselineReactionMs) && breached(b, last.baselineReactionMs)) {
        return { action: 'revert', from: mm, to: sanitizeSizeMm(mm + AUTO_STEP_MM) }
      }
    }
  }

  // ── 收紧 ────────────────────────────────────────────────────
  if (atAutoFloor(mm)) return { action: 'none' }   // 已到下限

  const cooldown = last?.kind === 'revert' ? REVERT_COOLDOWN_DAYS : AUTO_COOLDOWN_DAYS
  if (since < cooldown) return { action: 'none' }

  const win = days.slice(Math.max(0, todayIdx - AUTO_WINDOW_DAYS + 1), todayIdx + 1)
  if (win.length < AUTO_WINDOW_DAYS) return { action: 'none' }
  if (win.some((d) => d.accuracy < AUTO_MIN_ACCURACY)) return { action: 'none' }

  const windowMedian = median(win.map((d) => d.medianMs))
  if (windowMedian > AUTO_MAX_REACTION_MS) return { action: 'none' }

  return {
    action: 'tighten',
    from: mm,
    to: sanitizeSizeMm(mm - AUTO_STEP_MM),
    baselineReactionMs: windowMedian,
  }
}
