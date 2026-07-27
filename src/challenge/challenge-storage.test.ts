import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CHALLENGE_BEST_KEY, parseBest, bestAfter, readBest, writeBestIfHigher } from './challenge-storage'

/**
 * 本仓 vitest 的 environment 是 'node'，没有 localStorage（lsGet/lsSet 会 try/catch 成
 * null / 静默丢弃）。为了也覆盖那两层薄包装，这里注入一个最小内存实现。
 */
function installMemoryStorage(): Map<string, string> {
  const mem = new Map<string, string>()
  const fake = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, String(v)) },
    removeItem: (k: string) => { mem.delete(k) },
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() { return mem.size },
  }
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = fake
  return mem
}

let mem: Map<string, string>
beforeEach(() => { mem = installMemoryStorage() })
afterEach(() => { delete (globalThis as unknown as Record<string, unknown>).localStorage })

describe('parseBest', () => {
  it('没存过 → 0', () => {
    expect(parseBest(null)).toBe(0)
    expect(parseBest('')).toBe(0)
  })

  it('脏数据（手改过 / 别的版本写坏）→ 0，不是 NaN', () => {
    expect(parseBest('abc')).toBe(0)
    expect(parseBest('Infinity')).toBe(0)
  })

  it('负数 → 0', () => {
    expect(parseBest('-5')).toBe(0)
  })

  it('小数向下取整（分数是整数语义）', () => {
    expect(parseBest('12.9')).toBe(12)
  })
})

describe('bestAfter', () => {
  it('破纪录：返回新分并标记 isNewRecord', () => {
    expect(bestAfter('100', 137)).toEqual({ best: 137, isNewRecord: true })
  })

  it('没破：保留旧纪录', () => {
    expect(bestAfter('137', 100)).toEqual({ best: 137, isNewRecord: false })
  })

  it('平纪录不算新纪录（必须严格大于）', () => {
    expect(bestAfter('137', 137)).toEqual({ best: 137, isNewRecord: false })
  })

  it('0 分不算新纪录，即使从没玩过', () => {
    expect(bestAfter(null, 0)).toEqual({ best: 0, isNewRecord: false })
  })
})

describe('readBest / writeBestIfHigher（走真实 lsGet/lsSet）', () => {
  it('首次读为 0；破纪录后写入并能读回', () => {
    expect(readBest()).toBe(0)
    expect(writeBestIfHigher(88)).toEqual({ best: 88, isNewRecord: true })
    expect(mem.get(CHALLENGE_BEST_KEY)).toBe('88')
    expect(readBest()).toBe(88)
  })

  it('没破纪录时不写 storage（旧值原样留着）', () => {
    writeBestIfHigher(88)
    expect(writeBestIfHigher(50)).toEqual({ best: 88, isNewRecord: false })
    expect(mem.get(CHALLENGE_BEST_KEY)).toBe('88')
  })

  it('键名锚定 fzp.challengeBest —— 备份/恢复靠 fzp. 前缀自动收录，改名等于悄悄丢最高分', () => {
    expect(CHALLENGE_BEST_KEY).toBe('fzp.challengeBest')
  })
})
