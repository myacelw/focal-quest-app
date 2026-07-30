/**
 * 训练计时的时间源。
 *
 * 训练页原来用「1000ms 的 setInterval + tick(s, 1)」，而那个 effect 的依赖里有
 * session.phase——每答一题 phase 就在 showing↔transitioning 之间来回切两次，effect
 * 跟着 cleanup + 重建，setInterval 从零重新计时，已经攒了但不满一格的时间被直接丢掉。
 *
 * 后果不是"稍微不准"而是**倒计时可能完全冻结**：翻拍过渡是 600/900ms（快/适中档），
 * 孩子答得快时答题窗口也常不到 1000ms，于是两个阶段各自都触发不了哪怕一跳。
 * 她答得越快、越认真，一节 3 分钟越练不完。
 *
 * 这里把时间源换成「细步长 + 真实墙钟差」：步长比阶段短，且推进量取自 Date.now() 的
 * 差值而非"跳了几次"，即使 interval 被重建也只丢至多一个步长。同 src/challenge 的做法。
 */

/** 计时步长（ms）：倒计时只显示到秒，200ms 足够，且比翻拍过渡(≥600ms)短得多 */
export const TICK_MS = 200

/**
 * 单跳最多推进多少 ms。切走 app / 锁屏时浏览器会节流甚至暂停 interval，回来后
 * 墙钟差可能是好几分钟——那段时间孩子并没在练，不能算进训练时长。
 */
export const MAX_TICK_DELTA_MS = 1000

/** 墙钟差 → 本跳推进的秒数。负数（系统时钟回拨）归零，绝不让倒计时倒着走。 */
export function tickDeltaSec(nowMs: number, lastMs: number): number {
  return Math.min(Math.max(0, nowMs - lastMs), MAX_TICK_DELTA_MS) / 1000
}
