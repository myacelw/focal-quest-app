import { describe, it, expect } from 'vitest'
import { sha256Hex, randomHex, hashAuthKey, hashToken, timingSafeEqual, normalizeEmail, isValidEmail } from './crypto'

describe('sha256Hex', () => {
  it('对已知输入给出标准 SHA-256（与 RFC 对照值一致）', async () => {
    // "abc" 的 SHA-256 是众所周知的标准值，用它锚定实现没搞错编码
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('输出 64 位小写 hex', async () => {
    const h = await sha256Hex('随便什么中文')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('randomHex', () => {
  it('返回指定字节数的 hex（长度为字节数两倍）', () => {
    expect(randomHex(16)).toMatch(/^[0-9a-f]{32}$/)
    expect(randomHex(32)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('两次调用不相同（真随机）', () => {
    expect(randomHex(32)).not.toBe(randomHex(32))
  })
})

describe('hashAuthKey', () => {
  it('同 authKey 配不同盐得到不同结果（防彩虹表）', async () => {
    const a = await hashAuthKey('authkey-abc', 'salt1')
    const b = await hashAuthKey('authkey-abc', 'salt2')
    expect(a).not.toBe(b)
  })

  it('同 authKey 同盐可复现（登录才能比对成功）', async () => {
    const a = await hashAuthKey('authkey-abc', 'salt1')
    const b = await hashAuthKey('authkey-abc', 'salt1')
    expect(a).toBe(b)
  })

  it('盐与 authKey 的拼接有分隔，避免拼接歧义', async () => {
    // 若实现是朴素 salt+key，("ab","c") 与 ("a","bc") 会碰撞；有分隔符则不会
    const x = await hashAuthKey('c', 'ab')
    const y = await hashAuthKey('bc', 'a')
    expect(x).not.toBe(y)
  })
})

describe('hashToken', () => {
  it('可复现且是 64 位 hex（DB 只存哈希，比对靠重算）', async () => {
    const t = 'sometoken'
    expect(await hashToken(t)).toBe(await hashToken(t))
    expect(await hashToken(t)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('timingSafeEqual', () => {
  it('相同字符串为 true', () => {
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true)
  })

  it('不同字符串为 false', () => {
    expect(timingSafeEqual('abc123', 'abc124')).toBe(false)
  })

  it('长度不同为 false 且不抛错', () => {
    expect(timingSafeEqual('abc', 'abcdef')).toBe(false)
    expect(timingSafeEqual('', 'a')).toBe(false)
  })
})

describe('normalizeEmail', () => {
  it('小写化并去首尾空格（避免同一邮箱注册出两个账号）', () => {
    expect(normalizeEmail('  Parent@Example.COM ')).toBe('parent@example.com')
  })
})

describe('isValidEmail', () => {
  it('接受常见邮箱', () => {
    expect(isValidEmail('parent@example.com')).toBe(true)
    expect(isValidEmail('a.b+c@qq.com')).toBe(true)
  })

  it('拒绝明显不是邮箱的输入', () => {
    expect(isValidEmail('parent')).toBe(false)
    expect(isValidEmail('a@')).toBe(false)
    expect(isValidEmail('@b.com')).toBe(false)
    expect(isValidEmail('a b@c.com')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })

  it('拒绝超长输入（防滥用）', () => {
    expect(isValidEmail('a'.repeat(300) + '@example.com')).toBe(false)
  })
})
