import { describe, it, expect } from 'vitest'
import { KINDS as CLIENT_KINDS } from './sync-keys'
import { KINDS as SERVER_KINDS } from '../../functions/lib/sync-validate'

/**
 * 这条闸门补的是一个真实缺口：此前两份 KINDS 各自被一条硬编码断言看着，
 * 谁只改一边、只更新那一边的断言，两边的测试都还是绿的。
 *
 * 而线上后果很重：服务端 kind 白名单是**整批全或无**，一条未知 kind 让整批 400，
 * 400 又被 isPermanentStatus 判为永久错误 → 那批记录被隔离，而如果判错成暂时错误，
 * 坏批会永远卡在队首、这台设备再也同步不了任何数据，且全程静默。
 */
describe('前后端 KINDS 必须逐字一致', () => {
  it('客户端 src/sync/sync-keys.ts 与服务端 functions/lib/sync-validate.ts 完全相同', () => {
    expect([...CLIENT_KINDS]).toEqual([...SERVER_KINDS])
  })
})
