import type { Direction } from '../speech/answer-mapping'

export type Phase = 'preparing' | 'showing' | 'transitioning' | 'finished'
export type Eye = 'left' | 'right'

export interface SessionState {
  phase: Phase
  eye: Eye
  target: Direction | null
  answered: number
  correct: number
  flips: number
  elapsedSec: number
  durationSec: number
  correctStreak: number
  isEgg: boolean
}

const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right']

/** 连续答对达到此数，下一题变彩蛋 */
export const EGG_THRESHOLD = 5

export function createSession(eye: Eye, durationSec: number): SessionState {
  return {
    phase: 'preparing', eye, target: null,
    answered: 0, correct: 0, flips: 0, elapsedSec: 0, durationSec,
    correctStreak: 0, isEgg: false,
  }
}

/** 随机方向，rand∈[0,1)，避免与 prev 相同 */
export function pickDirection(prev: Direction | null, rand: number): Direction {
  const pool = prev ? DIRECTIONS.filter((d) => d !== prev) : DIRECTIONS
  const i = Math.min(pool.length - 1, Math.floor(rand * pool.length))
  return pool[i]
}

export function start(state: SessionState, firstTarget: Direction): SessionState {
  if (state.phase !== 'preparing') return state
  return { ...state, phase: 'showing', target: firstTarget }
}

export function answer(state: SessionState, dir: Direction): SessionState {
  if (state.phase !== 'showing' || state.target === null) return state
  const isRight = dir === state.target
  return {
    ...state,
    phase: 'transitioning',
    answered: state.answered + 1,
    correct: state.correct + (isRight ? 1 : 0),
    correctStreak: isRight ? state.correctStreak + 1 : 0,
  }
}

export function advance(state: SessionState, nextTarget: Direction): SessionState {
  if (state.phase !== 'transitioning') return state
  const isEgg = state.correctStreak >= EGG_THRESHOLD
  return {
    ...state,
    phase: 'showing',
    target: nextTarget,
    flips: state.flips + 1,
    isEgg,
    correctStreak: isEgg ? 0 : state.correctStreak,
  }
}

export function tick(state: SessionState, deltaSec: number): SessionState {
  if (state.phase === 'preparing' || state.phase === 'finished') return state
  const elapsedSec = state.elapsedSec + deltaSec
  if (elapsedSec >= state.durationSec) {
    return { ...state, elapsedSec: state.durationSec, phase: 'finished' }
  }
  return { ...state, elapsedSec }
}

export function accuracy(state: SessionState): number {
  return state.answered === 0 ? 0 : state.correct / state.answered
}
