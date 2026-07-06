import { describe, it, expect } from 'vitest'
import {
  createSession, pickDirection, start, answer, advance, tick, accuracy,
} from './session'

describe('createSession', () => {
  it('starts in preparing with zeroed counters', () => {
    const s = createSession('left', 180)
    expect(s).toMatchObject({
      phase: 'preparing', eye: 'left', target: null,
      answered: 0, correct: 0, flips: 0, elapsedSec: 0, durationSec: 180,
    })
  })
})

describe('pickDirection', () => {
  it('never repeats the previous direction', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(pickDirection('up', r)).not.toBe('up')
    }
  })
  it('picks from all four when prev is null', () => {
    expect(pickDirection(null, 0)).toBe('up')
  })
})

describe('start', () => {
  it('preparing → showing with a target', () => {
    const s = start(createSession('left', 180), 'right')
    expect(s.phase).toBe('showing')
    expect(s.target).toBe('right')
  })
})

describe('answer', () => {
  it('correct answer increments answered and correct, goes transitioning', () => {
    const s = start(createSession('left', 180), 'up')
    const a = answer(s, 'up')
    expect(a).toMatchObject({ phase: 'transitioning', answered: 1, correct: 1 })
  })
  it('wrong answer counts answered but not correct', () => {
    const s = start(createSession('left', 180), 'up')
    const a = answer(s, 'down')
    expect(a).toMatchObject({ phase: 'transitioning', answered: 1, correct: 0 })
  })
  it('ignores answer when not showing', () => {
    const s = createSession('left', 180)
    expect(answer(s, 'up')).toBe(s)
  })
})

describe('advance', () => {
  it('transitioning → showing, flips+1, new target', () => {
    let s = start(createSession('left', 180), 'up')
    s = answer(s, 'up')
    const n = advance(s, 'left')
    expect(n).toMatchObject({ phase: 'showing', target: 'left', flips: 1 })
  })
})

describe('tick', () => {
  it('accumulates elapsed time', () => {
    const s = start(createSession('left', 180), 'up')
    expect(tick(s, 1).elapsedSec).toBe(1)
  })
  it('finishes when duration reached', () => {
    const s = { ...start(createSession('left', 5), 'up'), elapsedSec: 4 }
    expect(tick(s, 1).phase).toBe('finished')
  })
  it('does not tick while preparing or finished', () => {
    const p = createSession('left', 180)
    expect(tick(p, 1)).toBe(p)
  })
})

describe('accuracy', () => {
  it('is 0 with no answers', () => {
    expect(accuracy(createSession('left', 180))).toBe(0)
  })
  it('is correct/answered', () => {
    const s = { ...createSession('left', 180), answered: 4, correct: 3 }
    expect(accuracy(s)).toBe(0.75)
  })
})
