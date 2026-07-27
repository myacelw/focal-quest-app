import type { Direction } from '../speech/answer-mapping'
import { windowMsForIndex, CHALLENGE_DURATION_MS, type Pace } from './challenge-pace'

/**
 * 限时挑战状态机（纯函数）。刻意**不复用** src/training/session.ts：
 * 挑战有每题时限、不分眼、不落库，硬合并会把那个被大量测试压住的训练状态机搞复杂，
 * 风险不对等。形状沿用它的两个范式：全部纯函数；不合法转移返回同一个对象引用。
 *
 * 时间单位是**毫秒**（训练那套是秒）——挑战要在 ms 级判超时。
 */

export type ChallengePhase = 'ready' | 'showing' | 'transitioning' | 'finished'
export type OutcomeKind = 'correct' | 'wrong' | 'timeout'

export interface ChallengeState {
  phase: ChallengePhase
  pace: Pace
  target: Direction | null
  /** 第几题，0 起；决定当前档位 */
  index: number
  /** 真答了几题（**不含超时**） */
  answered: number
  correct: number
  wrong: number
  /** 超时数：不算错也不得分，单独计数好让孩子知道是"看错"还是"没跟上" */
  timedOut: number
  score: number
  streak: number
  bestStreak: number
  /** 本题答题窗口 */
  windowMs: number
  /** 本题剩余窗口（只在 showing 里递减；翻拍过渡不压缩它） */
  windowLeftMs: number
  /** 已用总时长（墙钟，含翻拍过渡） */
  elapsedMs: number
  durationMs: number
  /** 每次离开 showing（答题或超时）都 +1；皮肤怪兽轮换与一次性演出靠它 */
  seq: number
  lastOutcome: { kind: OutcomeKind; dir: Direction; seq: number } | null
}

/** 答对基础分 */
export const BASE_SCORE = 10
/** 速度奖励上限（按剩余窗口比例给） */
export const SPEED_BONUS_MAX = 10
/** 每级连击奖励 */
export const COMBO_BONUS_STEP = 2
/** 连击奖励级数上限 */
export const COMBO_BONUS_CAP = 5

/** 答对得分 = 基础 + 速度奖励（剩余窗口比例）+ 连击奖励（封顶） */
export function scoreForAnswer(windowMs: number, windowLeftMs: number, streakAfter: number): number {
  const ratio = windowMs > 0 ? Math.max(0, Math.min(1, windowLeftMs / windowMs)) : 0
  const speed = Math.round(SPEED_BONUS_MAX * ratio)
  const combo = Math.min(Math.max(0, streakAfter - 1), COMBO_BONUS_CAP) * COMBO_BONUS_STEP
  return BASE_SCORE + speed + combo
}

export function createChallenge(pace: Pace, durationMs: number = CHALLENGE_DURATION_MS): ChallengeState {
  const windowMs = windowMsForIndex(pace, 0)
  return {
    phase: 'ready', pace, target: null, index: 0,
    answered: 0, correct: 0, wrong: 0, timedOut: 0,
    score: 0, streak: 0, bestStreak: 0,
    windowMs, windowLeftMs: windowMs,
    elapsedMs: 0, durationMs, seq: 0, lastOutcome: null,
  }
}

export function startChallenge(state: ChallengeState, firstTarget: Direction): ChallengeState {
  if (state.phase !== 'ready') return state
  const windowMs = windowMsForIndex(state.pace, 0)
  return { ...state, phase: 'showing', target: firstTarget, windowMs, windowLeftMs: windowMs }
}

export function answerChallenge(state: ChallengeState, dir: Direction): ChallengeState {
  if (state.phase !== 'showing' || state.target === null) return state
  const right = dir === state.target
  const streak = right ? state.streak + 1 : 0
  const gain = right ? scoreForAnswer(state.windowMs, state.windowLeftMs, streak) : 0
  const seq = state.seq + 1
  return {
    ...state,
    phase: 'transitioning',
    answered: state.answered + 1,
    correct: state.correct + (right ? 1 : 0),
    wrong: state.wrong + (right ? 0 : 1),
    score: state.score + gain,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    seq,
    lastOutcome: { kind: right ? 'correct' : 'wrong', dir, seq },
  }
}

export function advanceChallenge(state: ChallengeState, nextTarget: Direction): ChallengeState {
  if (state.phase !== 'transitioning') return state
  const index = state.index + 1
  const windowMs = windowMsForIndex(state.pace, index)
  return { ...state, phase: 'showing', target: nextTarget, index, windowMs, windowLeftMs: windowMs }
}

export function tickChallenge(state: ChallengeState, deltaMs: number): ChallengeState {
  if (state.phase !== 'showing' && state.phase !== 'transitioning') return state
  if (!(deltaMs > 0)) return state

  const elapsedMs = state.elapsedMs + deltaMs
  // 总时长优先：最后一跳同时撞上"整局结束"和"本题超时"时，不给那一题记超时
  if (elapsedMs >= state.durationMs) {
    return { ...state, elapsedMs: state.durationMs, phase: 'finished', windowLeftMs: 0 }
  }
  // 翻拍过渡：只走总时长，答题窗口不递减、也不被压缩（spec §4.2）
  if (state.phase !== 'showing') return { ...state, elapsedMs }

  const windowLeftMs = state.windowLeftMs - deltaMs
  if (windowLeftMs > 0) return { ...state, elapsedMs, windowLeftMs }

  // 超时 = 未答：不算错、不得分，但清连击并单独计数（spec §4.5）
  const seq = state.seq + 1
  return {
    ...state,
    elapsedMs,
    windowLeftMs: 0,
    phase: 'transitioning',
    timedOut: state.timedOut + 1,
    streak: 0,
    seq,
    // showing 阶段 target 必非空（start/advance 都会设），断言只为消掉可选类型
    lastOutcome: { kind: 'timeout', dir: state.target!, seq },
  }
}
