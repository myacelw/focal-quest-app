import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  decideVoiceGate, parseEnabled, parseCrashCount, nextCrashCount, VOICE_CRASH_LIMIT,
  harvestVoiceCrash, noteLoadStart, noteLoadSettled, clearVoicePending, readVoiceGate,
  readVoiceCrashes, writeVoiceEnabled, resetVoiceGuard,
  LS_VOICE_PENDING, LS_VOICE_CRASHES, LS_VOICE_ENABLED,
} from './voice-guard'

// 本仓 vitest 是 environment:'node'，没有 localStorage；而本模块测的就是"跨启动还记得住"，
// 非持久化不可测。装一个 Map 兜底的桩（lsGet/lsSet 本身 try/catch，不装就一律静默降级、
// 每个断言都会退化成"读到 null"而假绿）。跑完删掉，不留给别的测试文件。
const hadStorage = 'localStorage' in globalThis
if (!hadStorage) {
  const mem = new Map<string, string>()
  ;(globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, String(v)) },
    removeItem: (k: string) => { mem.delete(k) },
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() { return mem.size },
  } as Storage
}
afterAll(() => {
  if (!hadStorage) delete (globalThis as { localStorage?: Storage }).localStorage
})

beforeEach(() => {
  localStorage.removeItem(LS_VOICE_PENDING)
  localStorage.removeItem(LS_VOICE_CRASHES)
  localStorage.removeItem(LS_VOICE_ENABLED)
})

describe('decideVoiceGate', () => {
  it('默认（没关、没崩过）正常加载', () => {
    expect(decideVoiceGate(true, 0)).toBe('start')
  })

  it('家长关掉时不加载，且优先于崩溃降级（关就是关，不该出现"重试语音"的诱导）', () => {
    expect(decideVoiceGate(false, 0)).toBe('off')
    expect(decideVoiceGate(false, 9)).toBe('off')
  })

  it('上次加载途中被杀 → 本次不自动加载', () => {
    expect(decideVoiceGate(true, VOICE_CRASH_LIMIT)).toBe('crash-guard')
  })
})

describe('parseEnabled：严格白名单', () => {
  it('没存过当开', () => expect(parseEnabled(null)).toBe(true))
  it("'1' 开、'0' 关", () => {
    expect(parseEnabled('1')).toBe(true)
    expect(parseEnabled('0')).toBe(false)
  })
  it("手工写的 'false'/'off' 判为关——写这些字的人显然想关", () => {
    expect(parseEnabled('false')).toBe(false)
    expect(parseEnabled('off')).toBe(false)
  })
})

describe('parseCrashCount：脏值归 0', () => {
  it('没存过是 0', () => expect(parseCrashCount(null)).toBe(0))
  it('正常数字原样', () => expect(parseCrashCount('2')).toBe(2))
  it("'abc' / 负数 / 空串一律 0，不能因为 NaN 把语音永久关掉", () => {
    expect(parseCrashCount('abc')).toBe(0)
    expect(parseCrashCount('-3')).toBe(0)
    expect(parseCrashCount('')).toBe(0)
  })
})

describe('nextCrashCount', () => {
  it('面包屑还在才计数', () => {
    expect(nextCrashCount(0, true)).toBe(1)
    expect(nextCrashCount(1, false)).toBe(1)
  })
})

describe('面包屑全链路', () => {
  it('加载途中被杀（没有任何收尾事件）→ 下次启动判定为崩溃并降级', () => {
    noteLoadStart()
    // 进程被杀：noteLoadSettled / clearVoicePending 都没机会跑
    expect(harvestVoiceCrash()).toBe(true)
    expect(readVoiceCrashes()).toBe(1)
    expect(readVoiceGate()).toBe('crash-guard')
  })

  it('用户自己退出（pagehide）不算崩溃——否则正常用法也会被降级', () => {
    noteLoadStart()
    clearVoicePending()
    expect(harvestVoiceCrash()).toBe(false)
    expect(readVoiceGate()).toBe('start')
  })

  it('加载成功会把计数清零：缓存重新建好之后没理由继续降级', () => {
    localStorage.setItem(LS_VOICE_CRASHES, '3')
    noteLoadStart()
    noteLoadSettled(true)
    expect(readVoiceCrashes()).toBe(0)
    expect(harvestVoiceCrash()).toBe(false)
  })

  it('加载失败（网络断/模型 404）既不清零也不计数——那不是"被杀"', () => {
    localStorage.setItem(LS_VOICE_CRASHES, '1')
    noteLoadStart()
    noteLoadSettled(false)
    expect(readVoiceCrashes()).toBe(1)
    expect(harvestVoiceCrash()).toBe(false)
  })

  it('崩溃后每次启动都必须重新结算一次，不会把同一次崩溃重复计数', () => {
    noteLoadStart()
    harvestVoiceCrash()
    expect(harvestVoiceCrash()).toBe(false)
    expect(readVoiceCrashes()).toBe(1)
  })

  it('手动重试清掉降级状态', () => {
    noteLoadStart()
    harvestVoiceCrash()
    resetVoiceGuard()
    expect(readVoiceGate()).toBe('start')
  })

  it('家长关掉后，即便没崩过也不加载', () => {
    writeVoiceEnabled(false)
    expect(readVoiceGate()).toBe('off')
    writeVoiceEnabled(true)
    expect(readVoiceGate()).toBe('start')
  })
})
