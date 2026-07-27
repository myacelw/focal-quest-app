import { lsGet } from '../data/storage'

/**
 * 训练完成门槛——「这一天到底有没有真练」的唯一判据（spec §3）。
 *
 * 定位：**只挡挂机，不评判表现。** 所以这里没有正确率、没有 CPM、没有反应时间——
 * 那些是"练得好不好"，属于统计页与家长周报的职责，进了门槛就会变成惩罚慢的孩子，
 * 而调节灵敏度差的孩子本来就慢、恰恰是最该练的那一个。
 *
 * 数值推导：一个循环（看清 1-3 秒 + 报答案 + 翻拍过渡 0.6-1.5 秒）约 2-5 秒，
 * 3 分钟一节的现实产出是 40-80 个答对，门槛 15 只要求其中 20-35%
 * ——12 秒才要一个，只有"三分之二的时间在发呆都做不到"的人才会被拦。
 *
 * ⚠️ 调参只改 GOAL_CORRECT_PER_MIN 一处。要**完全回退**本功能，必须把
 * GOAL_CORRECT_PER_MIN 与 GOAL_MIN_PER_EYE **同时**设 0——只设前者会被后者的下限顶住。
 */

/** 单眼时长默认值（秒）。原先是 TrainingPage 私有的 DURATION_SEC，搬到这里做唯一出处 */
export const DEFAULT_DURATION_SEC = 180
/** 门槛速率：每分钟需答对几个 */
export const GOAL_CORRECT_PER_MIN = 5
/** 单节门槛下限（防极短时长算出 0） */
export const GOAL_MIN_PER_EYE = 5
/** 时长钳制区间 = 设置页四个档位 [60,120,180,300] 的上下界 */
export const DURATION_MIN_SEC = 60
export const DURATION_MAX_SEC = 300
/** 一轮训练的眼数（左 + 右） */
export const EYES_PER_ROUND = 2
/**
 * 当日结算的答对数封顶倍数（封在 goal × factor）。**0 = 不封顶，即现状行为。**
 *
 * 背景（spec §4.3）：加门槛后"第一轮不达标、第二轮补够"那天会按**当天累计**结算，
 * 而"第一轮就达标"那天只按第一轮结算 —— 同样练两轮，前者 375 分、后者 230 分（+63%）。
 * 方向是"多练只有先失败才发分"，而积分能换现实奖励与补签卡。
 *
 * ⚠️ 真要开这个开关，factor 取 **6** 左右（3 分钟档 → 封在 180，高于一轮的现实上限
 * 80-160）。**不要取 2**：3 分钟档门槛只有 30，封在 60 会把诚实一轮的当日积分从
 * 430-830 砍到 330，属于严重误伤诚实训练。
 */
export const POINTS_CORRECT_CAP_FACTOR = 0

/**
 * 把脏 localStorage 值钳成可用秒数。
 * fzp.durationSec 无任何校验：`Number('abc')=NaN`、`Number('0')=0`。
 * 不兜住的话 NaN 会让所有门槛比较为 false（**静默全放行**），0 会让门槛变 0（同样失效）。
 */
export function sanitizeDurationSec(sec: number): number {
  if (!Number.isFinite(sec) || sec <= 0) return DEFAULT_DURATION_SEC
  return Math.min(Math.max(sec, DURATION_MIN_SEC), DURATION_MAX_SEC)
}

/** 单眼一节的门槛：round(分钟 × 速率)，不低于下限 */
export function goalPerEye(durationSec: number): number {
  const sec = sanitizeDurationSec(durationSec)
  return Math.max(GOAL_MIN_PER_EYE, Math.round((sec / 60) * GOAL_CORRECT_PER_MIN))
}

/**
 * 整次（一轮双眼）门槛——**判定用的就是这个数**。
 * 刻意不做单眼各判：弱眼天生慢，各判等于对最该练的那只眼施加最严标准；
 * 而且某只眼状态差就整轮作废、要重练 6 分钟，会直接毁掉坚持引擎（spec §4.2）。
 */
export function goalPerRound(durationSec: number): number {
  return goalPerEye(durationSec) * EYES_PER_ROUND
}

/**
 * 某一天的门槛（spec §3.5）——**当天真实练过的最长一节说话，不是"现在设置的是几分钟"**。
 *
 * 为什么不能只看当前设置：`fzp.durationSec` 就是设置页「⏱️ 单眼时长」那四个按钮，
 * 而「⚙️ 设置」在常驻导航里、孩子随手可点。只按当前设置算就有两个方向的错：
 *  - 追溯降门槛（真漏洞）：3 分钟档练完只拿到 12 个（门槛 30）→ 点一下「1分」→ 门槛变 10
 *    → correctToday 里那 12 个照样算 → 下次 doCheckIn 直接打卡成功；
 *  - 追溯抬门槛（误伤家长）：中途把 1 分改成 5 分 → 门槛 10 跳到 50，当天已练的全作废。
 *
 * elapsedSec 靠得住的原因：saveSession 只在 phase==='finished' 落库，而 tick()
 * 到点时把 elapsedSec 钳成 durationSec（src/training/session.ts:73-74），
 * 所以它精确等于那一节当时的档位，事后改设置改不动它。
 * 取 max 而非 min/平均：长短节混练时按最长那节要求，避免"先长后短"稀释门槛。
 */
export function goalForDay(durationSec: number, sessionElapsedSecs: number[]): number {
  const practiced = sessionElapsedSecs.filter((s) => Number.isFinite(s) && s > 0)
  if (practiced.length === 0) return goalPerRound(durationSec)
  return goalPerRound(Math.max(...practiced))
}

/**
 * 过去某一天的门槛：只看那天真实练过的时长。
 * 第一个实参在 practiced 非空时用不上——但补签闸门永远在"那天有 session 行"之后才调，
 * 传 DEFAULT_DURATION_SEC 只是给空数组一个保守兜底，绝不会把"现在"的设置掺进历史判定。
 */
export function goalForPastDay(sessionElapsedSecs: number[]): number {
  return goalForDay(DEFAULT_DURATION_SEC, sessionElapsedSecs)
}

/**
 * 那天是不是「练了但没练够」——补签闸门的唯一判据（spec §5.6）。
 *
 * ⚠️ 刻意**不是**"那天有没有 session 行"。saveSession 只在计时走满时落库，所以"有行"
 * 真正等价的是"完整走完过一节"：
 *  - 练到 40 个（远超门槛 30）却没点完成键就被收走 iPad → 有行、无打卡行 →
 *    若按"有行就不可补"，最该补的一天反而被堵死；
 *  - 中途退出不满一节 → 一行都不落 → "点开就退出"的日子照样能花 50 分买回连续。
 * 净效果会把孩子教成"要么练够、要么干脆别开"，与坚持引擎的目标正相反。
 */
export function dayFellShort(correctSum: number, sessionElapsedSecs: number[]): boolean {
  const practiced = sessionElapsedSecs.filter((s) => Number.isFinite(s) && s > 0)
  if (practiced.length === 0) return false // 那天压根没练 → 可补，这才是补签卡的设计意图
  return !meetsGoal(correctSum, goalForPastDay(practiced))
}

/** 还差几个（不为负）；答对数是脏值时按最不利处理 */
export function shortfall(correctToday: number, goal: number): number {
  if (!Number.isFinite(correctToday)) return goal
  return Math.max(0, goal - correctToday)
}

/** 是否达标；答对数是脏值时不放行 */
export function meetsGoal(correctToday: number, goal: number): boolean {
  return Number.isFinite(correctToday) && correctToday >= goal
}

/**
 * 进当日结算的答对数。默认（factor = 0）原样返回，也就是**现状行为不变**。
 * 见 POINTS_CORRECT_CAP_FACTOR 的注释：这是"先失败再补够多发 63%"那条不对称的止损阀门，
 * 开不开由用户拍板（计划 Step 0.6）。
 */
export function pointsCorrect(
  correctToday: number,
  goal: number,
  factor: number = POINTS_CORRECT_CAP_FACTOR,
): number {
  if (!Number.isFinite(factor) || factor <= 0) return correctToday
  return Math.min(correctToday, goal * factor)
}

/**
 * 单眼时长的**唯一读取口**（薄包装，与 src/challenge/challenge-storage.ts 同构）。
 * TrainingPage 原先自己有一份不做校验的同名函数——那会让"训练实际跑多久"和
 * "门槛按多久算"两个数出现漂移。统一到这里之后，两者永远同源。
 */
export function readDurationSec(): number {
  const v = lsGet('fzp.durationSec')
  return sanitizeDurationSec(v === null ? NaN : Number(v))
}
