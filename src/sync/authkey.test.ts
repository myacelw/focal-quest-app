import { describe, it, expect } from 'vitest'
import { deriveAuthKey, normalizeEmail, PBKDF2_ITERATIONS } from './authkey'

// 大部分断言用小迭代数跑，快；最后单独验一次真实的 310000 次
const FAST = 1000

describe('PBKDF2_ITERATIONS', () => {
  it('恒为 310000（spec §5.2；调小等于削弱防泄库的唯一屏障）', () => {
    expect(PBKDF2_ITERATIONS).toBe(310_000)
  })
})

describe('normalizeEmail', () => {
  it('去首尾空格并小写——必须与服务端 functions/lib/crypto.ts 逐字一致，否则盐不同、登录必失败', () => {
    expect(normalizeEmail('  Parent@Example.COM ')).toBe('parent@example.com')
  })
})

describe('deriveAuthKey', () => {
  it('输出 64 位小写 hex（服务端按 /^[0-9a-f]{64}$/ 校验）', async () => {
    expect(await deriveAuthKey('parent@example.com', 'hunter2', FAST)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('同 email + password 可复现（否则登录不上）', async () => {
    const a = await deriveAuthKey('parent@example.com', 'hunter2', FAST)
    const b = await deriveAuthKey('parent@example.com', 'hunter2', FAST)
    expect(a).toBe(b)
  })

  it('密码不同则结果不同', async () => {
    const a = await deriveAuthKey('parent@example.com', 'hunter2', FAST)
    const b = await deriveAuthKey('parent@example.com', 'hunter3', FAST)
    expect(a).not.toBe(b)
  })

  it('邮箱不同（盐不同）则结果不同——同一密码在不同账号下哈希不同', async () => {
    const a = await deriveAuthKey('a@example.com', 'hunter2', FAST)
    const b = await deriveAuthKey('b@example.com', 'hunter2', FAST)
    expect(a).not.toBe(b)
  })

  it('邮箱大小写与空格不影响结果（盐先 normalize）', async () => {
    const a = await deriveAuthKey('parent@example.com', 'hunter2', FAST)
    const b = await deriveAuthKey('  Parent@EXAMPLE.com ', 'hunter2', FAST)
    expect(a).toBe(b)
  })

  it('迭代次数真的参与运算（防止实现里把参数漏掉）', async () => {
    const a = await deriveAuthKey('parent@example.com', 'hunter2', FAST)
    const b = await deriveAuthKey('parent@example.com', 'hunter2', FAST + 1)
    expect(a).not.toBe(b)
  })

  it('默认的 310000 次也能算出合法形状（不因迭代数大而出错）', async () => {
    expect(await deriveAuthKey('parent@example.com', 'hunter2')).toMatch(/^[0-9a-f]{64}$/)
  })
})
