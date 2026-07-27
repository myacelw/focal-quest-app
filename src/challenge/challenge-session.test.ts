import { describe, it, expect } from 'vitest'
import { derivePace, windowMsForIndex, CHALLENGE_DURATION_MS } from './challenge-pace'
import {
  createChallenge, startChallenge, answerChallenge, advanceChallenge, tickChallenge,
  scoreForAnswer, BASE_SCORE, SPEED_BONUS_MAX, COMBO_BONUS_STEP, COMBO_BONUS_CAP,
  type ChallengeState,
} from './challenge-session'

/** 基准 1000ms：初始 2000 / 最快 1300 / 每档 175（见 challenge-pace 的算例） */
const PACE = derivePace([1000, 1000, 1000, 1000])

function playing(over: Partial<ChallengeState> = {}): ChallengeState {
  return { ...startChallenge(createChallenge(PACE), 'up'), ...over }
}

describe('createChallenge', () => {
  it('初值：ready、零分、窗口已按第 1 档预置、总时长 30 秒', () => {
    const s = createChallenge(PACE)
    expect(s).toMatchObject({
      phase: 'ready', target: null, index: 0, answered: 0, correct: 0, wrong: 0,
      timedOut: 0, score: 0, streak: 0, bestStreak: 0, elapsedMs: 0,
      durationMs: CHALLENGE_DURATION_MS, seq: 0, lastOutcome: null,
    })
    expect(s.windowMs).toBe(windowMsForIndex(PACE, 0))
    expect(s.windowLeftMs).toBe(s.windowMs)
  })
})

describe('startChallenge', () => {
  it('ready → showing，并给出首题与满格窗口', () => {
    const s = startChallenge(createChallenge(PACE), 'left')
    expect(s).toMatchObject({ phase: 'showing', target: 'left', windowMs: 2000, windowLeftMs: 2000 })
  })

  it('非 ready 时返回同一个对象引用（不合法转移不产生新状态）', () => {
    const s = playing()
    expect(startChallenge(s, 'down')).toBe(s)
  })
})

describe('scoreForAnswer', () => {
  it('满窗答对 = 基础 + 满速度奖励', () => {
    expect(scoreForAnswer(2000, 2000, 1)).toBe(BASE_SCORE + SPEED_BONUS_MAX)
  })

  it('半窗答对 = 基础 + 半速度奖励 + 连击奖励', () => {
    expect(scoreForAnswer(2000, 1000, 3)).toBe(BASE_SCORE + 5 + 2 * COMBO_BONUS_STEP)
  })

  it('窗尽才答上也有基础分；连击奖励封顶', () => {
    expect(scoreForAnswer(2000, 0, 20)).toBe(BASE_SCORE + COMBO_BONUS_CAP * COMBO_BONUS_STEP)
  })
})

describe('answerChallenge', () => {
  it('答对：加分、连击 +1、bestStreak 跟进、转入翻拍过渡', () => {
    const s = playing({ windowLeftMs: 2000 })
    const n = answerChallenge(s, 'up')
    expect(n).toMatchObject({
      phase: 'transitioning', answered: 1, correct: 1, wrong: 0, timedOut: 0,
      streak: 1, bestStreak: 1, seq: 1,
    })
    expect(n.score).toBe(scoreForAnswer(2000, 2000, 1))
    expect(n.lastOutcome).toEqual({ kind: 'correct', dir: 'up', seq: 1 })
  })

  it('答错：不加分、连击清零、只进 wrong 计数（bestStreak 保留历史最高）', () => {
    const s = playing({ windowLeftMs: 1500, streak: 4, bestStreak: 4, score: 99 })
    const n = answerChallenge(s, 'down')
    expect(n).toMatchObject({
      phase: 'transitioning', answered: 1, correct: 0, wrong: 1, timedOut: 0,
      score: 99, streak: 0, bestStreak: 4,
    })
    expect(n.lastOutcome).toMatchObject({ kind: 'wrong', dir: 'down' })
  })

  it('非 showing（翻拍过渡中重复点）返回同一引用', () => {
    const s = playing({ phase: 'transitioning' })
    expect(answerChallenge(s, 'up')).toBe(s)
  })
})

describe('advanceChallenge', () => {
  it('题号 +1、换靶、窗口按新档位重置', () => {
    const s = playing({ phase: 'transitioning', index: 2 })
    const n = advanceChallenge(s, 'right')
    expect(n).toMatchObject({ phase: 'showing', target: 'right', index: 3, windowMs: 1825, windowLeftMs: 1825 })
  })

  it('非 transitioning 返回同一引用', () => {
    const s = playing()
    expect(advanceChallenge(s, 'left')).toBe(s)
  })
})

describe('tickChallenge', () => {
  it('showing 里同时推进总时长与本题窗口', () => {
    const n = tickChallenge(playing(), 300)
    expect(n).toMatchObject({ phase: 'showing', elapsedMs: 300, windowLeftMs: 1700 })
  })

  it('时限只覆盖答题窗口：翻拍过渡期间只走总时长，窗口不被压缩（spec §4.2）', () => {
    const s = playing({ phase: 'transitioning', windowLeftMs: 640 })
    const n = tickChallenge(s, 900)
    expect(n).toMatchObject({ phase: 'transitioning', elapsedMs: 900, windowLeftMs: 640 })
  })

  it('窗口耗尽 = 超时：不算错、不得分、清连击、单独计数、answered 不变（spec §4.5）', () => {
    const s = playing({ windowLeftMs: 100, streak: 3, bestStreak: 3, score: 50, answered: 4, correct: 3, wrong: 1 })
    const n = tickChallenge(s, 150)
    expect(n).toMatchObject({
      phase: 'transitioning', windowLeftMs: 0, timedOut: 1,
      answered: 4, correct: 3, wrong: 1, score: 50, streak: 0, bestStreak: 3, seq: 1,
    })
    expect(n.lastOutcome).toEqual({ kind: 'timeout', dir: 'up', seq: 1 })
  })

  it('总时长到 → finished，elapsed 钳到 durationMs', () => {
    const s = playing({ elapsedMs: CHALLENGE_DURATION_MS - 50 })
    const n = tickChallenge(s, 500)
    expect(n).toMatchObject({ phase: 'finished', elapsedMs: CHALLENGE_DURATION_MS })
  })

  it('总时长与超时同一跳命中时以"结束"优先（不给最后一题记一次超时）', () => {
    const s = playing({ elapsedMs: CHALLENGE_DURATION_MS - 50, windowLeftMs: 10 })
    const n = tickChallenge(s, 500)
    expect(n.phase).toBe('finished')
    expect(n.timedOut).toBe(0)
  })

  it('ready / finished / 非正 delta 都返回同一引用', () => {
    const r = createChallenge(PACE)
    expect(tickChallenge(r, 100)).toBe(r)
    const f = playing({ phase: 'finished' })
    expect(tickChallenge(f, 100)).toBe(f)
    const p = playing()
    expect(tickChallenge(p, 0)).toBe(p)
  })

  it('30 秒整局：答对与超时混跑，最终必然 finished 且 elapsed 恰好等于总时长', () => {
    let s = startChallenge(createChallenge(PACE), 'up')
    let guard = 0
    // 每题：答/超时 → 翻拍 600ms → 下一题；每跳 100ms
    while (s.phase !== 'finished' && guard++ < 2000) {
      if (s.phase === 'showing') {
        // 偶数题快答，奇数题故意拖到超时
        if (s.index % 2 === 0) s = answerChallenge(s, s.target!)
        else s = tickChallenge(s, s.windowLeftMs + 1)
      } else {
        const before = s.seq
        s = tickChallenge(s, 600)
        if (s.phase === 'transitioning' && s.seq === before) s = advanceChallenge(s, 'left')
      }
    }
    expect(s.phase).toBe('finished')
    expect(s.elapsedMs).toBe(CHALLENGE_DURATION_MS)
    expect(s.correct + s.timedOut).toBeGreaterThan(0)
    expect(s.answered).toBe(s.correct + s.wrong)
  })

  it('seq 每次离开 showing 都单调 +1（皮肤怪兽轮换与答题演出都依赖它）', () => {
    let s = startChallenge(createChallenge(PACE), 'up')
    const seen: number[] = []
    for (let i = 0; i < 4; i++) {
      s = i % 2 === 0 ? answerChallenge(s, s.target!) : tickChallenge(s, s.windowLeftMs + 1)
      seen.push(s.seq)
      s = advanceChallenge(s, 'right')
    }
    expect(seen).toEqual([1, 2, 3, 4])
  })
})
