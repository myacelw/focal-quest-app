import { describe, it, expect } from 'vitest'

// 用 Vite 的 ?raw 拿源文件文本（本仓没装 @types/node，node:fs 会让 tsc 报 TS2307）
import page from './TrainingPage.tsx?raw'
import { createSession, start, answer, advance, tick, type SessionState } from './session'
import { tickDeltaSec, TICK_MS, MAX_TICK_DELTA_MS } from './timer'

const DUR = 180

/**
 * 模拟一整节训练：每题「答题 answerMs → 翻拍 flipMs」循环，直到 session 结束或墙钟超上限。
 *
 * 两个驱动器建模的是**同一段训练**在两种计时实现下的走时，差别只在计时器怎么被驱动：
 *  - runNew：interval 只随「是否在跑」挂载一次，按真实墙钟差推进（本次修复后的实现）
 *  - runOld：1000ms 固定间隔 + 每次 phase 切换重建 interval（修复前的实现，即 bug 本身）
 */
function simulate(
  answerMs: number,
  flipMs: number,
  maxWallMs: number,
  driver: 'new' | 'old',
): { state: SessionState; wallMs: number } {
  let s = start(createSession('left', DUR), 'up')
  let now = 0
  let lastTick = 0
  let phaseEndsAt = answerMs
  let nextFire = 1000 // 仅 old 用：interval 下次触发的墙钟时刻
  // old 用 10ms 细步进，才能精确表达"phase 切换那一刻 interval 被重建"
  const step = driver === 'new' ? TICK_MS : 10

  while (s.phase !== 'finished' && now < maxWallMs) {
    now += step
    if (now >= phaseEndsAt) {
      const wasShowing = s.phase === 'showing'
      s = wasShowing ? answer(s, s.target!) : advance(s, 'up')
      phaseEndsAt += wasShowing ? flipMs : answerMs
      // ⚠️ bug 的本体：effect 依赖 session.phase，每次切换都 cleanup+重建 interval，
      // 已经攒了但不满 1000ms 的余量被直接丢弃。
      if (driver === 'old') nextFire = now + 1000
    }
    if (driver === 'new') {
      const d = tickDeltaSec(now, lastTick)
      lastTick = now
      s = tick(s, d)
    } else if (now >= nextFire) {
      s = tick(s, 1)
      nextFire = now + 1000
    }
  }
  return { state: s, wallMs: now }
}

describe('tickDeltaSec', () => {
  it('按真实墙钟差推进，不满一秒的余量照样算进去', () => {
    expect(tickDeltaSec(1200, 1000)).toBeCloseTo(0.2)
    expect(tickDeltaSec(1000, 0)).toBeCloseTo(1)
  })

  it('钳制单跳上限：切走 app / 锁屏几分钟回来，那段时间不算训练时长', () => {
    expect(tickDeltaSec(300_000, 0)).toBeCloseTo(MAX_TICK_DELTA_MS / 1000)
  })

  it('系统时钟回拨时归零，绝不让倒计时倒着走', () => {
    expect(tickDeltaSec(900, 1000)).toBe(0)
  })
})

describe('训练计时随答题节奏走时的准确性', () => {
  it('答得飞快（0.8s 一题 + 0.9s 翻拍）时，3 分钟的一节就是 3 分钟墙钟', () => {
    const { state, wallMs } = simulate(800, 900, 600_000, 'new')
    expect(state.phase).toBe('finished')
    expect(state.elapsedSec).toBe(DUR)
    // 允许一个 tick 的量化误差
    expect(wallMs).toBeGreaterThanOrEqual(DUR * 1000)
    expect(wallMs).toBeLessThanOrEqual(DUR * 1000 + TICK_MS)
  })

  it('答得慢（3s 一题）时同样准，不会因为余量累积而提前结束', () => {
    const { state, wallMs } = simulate(3000, 1500, 600_000, 'new')
    expect(state.phase).toBe('finished')
    expect(wallMs).toBeLessThanOrEqual(DUR * 1000 + TICK_MS)
  })

  /**
   * 回归锚：把 bug 本身钉成文档。修复前 interval 依赖 session.phase 重建，
   * 而 showing(800ms) 与 transitioning(900ms) 都不足 1000ms，于是**一跳都触发不了**——
   * 倒计时完全冻结，孩子答得越快越练不完。这就是"翻转点得快了倒计时会卡住"。
   */
  it('旧实现在同样节奏下倒计时完全冻结（10 分钟墙钟一秒都没走）', () => {
    const { state } = simulate(800, 900, 600_000, 'old')
    expect(state.phase).not.toBe('finished')
    expect(state.elapsedSec).toBe(0)
  })
})

describe('训练页计时实现的源文本契约', () => {
  it('计时 interval 必须走真实墙钟差，不许回到固定 1 秒粒度', () => {
    expect(page).toContain('tickDeltaSec(')
    expect(page, '固定 1 秒粒度会在 phase 频繁切换时丢余量').not.toMatch(/tick\(s,\s*1\)/)
  })

  it('计时 effect 的依赖不许含 session.phase（含它就会每答一题重建 interval）', () => {
    const m = page.match(/window\.setInterval\([\s\S]*?\n\s*\}, \[([^\]]*)\]\)/)
    expect(m, '训练页应有一处计时 interval').toBeTruthy()
    expect(m![1]).not.toContain('session.phase')
  })
})
