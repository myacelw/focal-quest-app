import { describe, it, expect } from 'vitest'
import { mergeRecord } from './merge'

const T = 1_700_000_000_000

describe('mergeRecord — 本地没有这条', () => {
  it('一律写入', () => {
    expect(mergeRecord('session', null, { payload: { correct: 9 }, updatedAt: T })).toEqual({ op: 'put' })
  })
})

describe('mergeRecord — LWW（session / checkin / reward / redemption / exam）', () => {
  it('远端更新则覆盖本地', () => {
    const local = { correct: 5, updatedAt: T }
    expect(mergeRecord('session', local, { payload: { correct: 9 }, updatedAt: T + 1000 })).toEqual({ op: 'put' })
  })

  it('远端更旧则保留本地', () => {
    const local = { correct: 9, updatedAt: T }
    expect(mergeRecord('session', local, { payload: { correct: 5 }, updatedAt: T - 1000 })).toEqual({ op: 'skip' })
  })

  it('时间相等则保留本地（结果确定，且省一次写盘）', () => {
    const local = { correct: 9, updatedAt: T }
    expect(mergeRecord('session', local, { payload: { correct: 5 }, updatedAt: T })).toEqual({ op: 'skip' })
  })

  it('reward 软删（active=false）能靠 LWW 传播', () => {
    const local = { title: '看动画片', active: true, updatedAt: T }
    expect(mergeRecord('reward', local, { payload: { title: '看动画片', active: false }, updatedAt: T + 1 }))
      .toEqual({ op: 'put' })
  })

  it('redemption 状态流转（pending→fulfilled）能靠 LWW 传播', () => {
    const local = { status: 'pending', updatedAt: T }
    expect(mergeRecord('redemption', local, { payload: { status: 'fulfilled' }, updatedAt: T + 1 }))
      .toEqual({ op: 'put' })
  })

  it('exam 走 LWW', () => {
    const local = { date: '2026-07-01', left: 0.6, updatedAt: T }
    expect(mergeRecord('exam', local, { payload: { date: '2026-07-01', left: 0.8 }, updatedAt: T + 1 }))
      .toEqual({ op: 'put' })
  })

  it('checkin 走 LWW（链条错乱交给 reconcileCheckins 整体重算，不在这里修）', () => {
    const local = { date: '2026-07-20', streak: 1, updatedAt: T }
    expect(mergeRecord('checkin', local, { payload: { date: '2026-07-20', streak: 3 }, updatedAt: T + 1 }))
      .toEqual({ op: 'put' })
  })
})

describe('mergeRecord — badge / monster 取最早', () => {
  it('远端 unlockedAt 更早则覆盖（首次达成时刻才是正确语义）', () => {
    const local = { id: 'streak-7', unlockedAt: T, updatedAt: T }
    expect(mergeRecord('badge', local, { payload: { id: 'streak-7', unlockedAt: T - 86_400_000 }, updatedAt: T - 1 }))
      .toEqual({ op: 'put' })
  })

  it('远端 unlockedAt 更晚就保留本地——即使远端 updatedAt 更大（LWW 会在这里犯错）', () => {
    const local = { id: 'streak-7', unlockedAt: T, updatedAt: T }
    expect(mergeRecord('badge', local, { payload: { id: 'streak-7', unlockedAt: T + 86_400_000 }, updatedAt: T + 99_999 }))
      .toEqual({ op: 'skip' })
  })

  it('monster 按 capturedAt 取最早', () => {
    const local = { id: 'sp-ufo', capturedAt: T, updatedAt: T }
    expect(mergeRecord('monster', local, { payload: { id: 'sp-ufo', capturedAt: T - 1 }, updatedAt: T + 5 }))
      .toEqual({ op: 'put' })
    expect(mergeRecord('monster', local, { payload: { id: 'sp-ufo', capturedAt: T + 1 }, updatedAt: T + 5 }))
      .toEqual({ op: 'skip' })
  })

  it('远端 payload 缺时间戳字段时退回 updatedAt 比较（不崩、不误删）', () => {
    const local = { id: 'streak-7', unlockedAt: T, updatedAt: T }
    expect(mergeRecord('badge', local, { payload: { id: 'streak-7' }, updatedAt: T - 1 })).toEqual({ op: 'put' })
  })
})

describe('mergeRecord — 墓碑', () => {
  it('本地更旧则删除本地行', () => {
    const local = { date: '2026-07-01', updatedAt: T }
    expect(mergeRecord('exam', local, { payload: { _deleted: true }, updatedAt: T + 1 })).toEqual({ op: 'delete' })
  })

  it('本地更新则不删（删除也要服从 LWW，否则"删了又改"的顺序会被反转）', () => {
    const local = { date: '2026-07-01', updatedAt: T + 10 }
    expect(mergeRecord('exam', local, { payload: { _deleted: true }, updatedAt: T })).toEqual({ op: 'skip' })
  })

  it('本地本就没有也返回 delete（幂等空删，调用方无需分支）', () => {
    expect(mergeRecord('exam', null, { payload: { _deleted: true }, updatedAt: T })).toEqual({ op: 'delete' })
  })
})
