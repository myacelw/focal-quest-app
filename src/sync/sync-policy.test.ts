import { describe, it, expect } from 'vitest'
import { nextDelayMs, dedupeOutbox, chunk, chunkByBytes, isPermanentStatus, MAX_BATCH } from './sync-policy'
import type { OutboxRow } from '../data/db'

function box(uuid: string, updatedAt: number): OutboxRow {
  return { id: updatedAt, uuid, kind: 'exam', payload: { at: updatedAt }, updatedAt, op: 'put' }
}

describe('nextDelayMs — 指数退避', () => {
  it('1s → 2s → 4s', () => {
    expect(nextDelayMs(0)).toBe(1000)
    expect(nextDelayMs(1)).toBe(2000)
    expect(nextDelayMs(2)).toBe(4000)
  })

  it('封顶 5 分钟（后端挂一整天也不会退避到荒谬的间隔）', () => {
    expect(nextDelayMs(30)).toBe(300_000)
  })

  it('负数当 0 处理（防御）', () => {
    expect(nextDelayMs(-5)).toBe(1000)
  })
})

describe('dedupeOutbox', () => {
  it('同 uuid 只留 updatedAt 最大的那条（服务端是 LWW 快照表，中间态发过去也会被立刻覆盖）', () => {
    const out = dedupeOutbox([box('a', 1), box('a', 5), box('a', 3)])
    expect(out.length).toBe(1)
    expect(out[0].updatedAt).toBe(5)
  })

  it('不同 uuid 全保留，按各自首次出现的顺序（便于对着 outbox 人工排查）', () => {
    expect(dedupeOutbox([box('a', 1), box('b', 2), box('a', 9)]).map((r) => r.uuid)).toEqual(['a', 'b'])
  })
})

describe('chunk', () => {
  it('按服务端单批上限切（501 条 → 500 + 1）', () => {
    const items = Array.from({ length: 501 }, (_, i) => i)
    const parts = chunk(items, MAX_BATCH)
    expect(parts.length).toBe(2)
    expect(parts[0].length).toBe(500)
    expect(parts[1].length).toBe(1)
  })

  it('空数组得到空批次列表', () => {
    expect(chunk([], MAX_BATCH)).toEqual([])
  })
})

describe('chunkByBytes — 按 body 体量再切一层', () => {
  it('累计字节超上限就换一批（服务端 readJson 有 1MB body 硬上限，超了整批 400）', () => {
    // 每条约 60 字节，上限设 150 → 每批最多两条
    const rows = [box('a', 1), box('b', 2), box('c', 3)]
    const parts = chunkByBytes(rows, 150, MAX_BATCH)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.flat().length).toBe(3)
  })

  it('单条就超上限时也独立成一批（不能死循环，也不能悄悄丢掉它）', () => {
    const parts = chunkByBytes([box('a', 1)], 1, MAX_BATCH)
    expect(parts).toHaveLength(1)
    expect(parts[0]).toHaveLength(1)
  })
})

describe('isPermanentStatus — 推送失败是暂时还是永久', () => {
  it('4xx（除 401/429）算永久：服务端整批 schema 校验不通过，重试一万次也是同一结果', () => {
    expect(isPermanentStatus(400)).toBe(true)
    expect(isPermanentStatus(413)).toBe(true)
  })

  it('401 与 429 不算永久：一个要重新登录、一个过一会儿就好，都不该隔离记录', () => {
    expect(isPermanentStatus(401)).toBe(false)
    expect(isPermanentStatus(429)).toBe(false)
  })

  it('5xx 与 0（断网）不算永久 —— 必须原样留在 outbox 退避重试，绝不丢数据', () => {
    expect(isPermanentStatus(500)).toBe(false)
    expect(isPermanentStatus(503)).toBe(false)
    expect(isPermanentStatus(507)).toBe(false)
    expect(isPermanentStatus(0)).toBe(false)
  })
})
