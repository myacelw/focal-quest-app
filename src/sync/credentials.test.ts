import { describe, it, expect } from 'vitest'
import { validateCredentials, MIN_PASSWORD_LENGTH } from './credentials'

describe('MIN_PASSWORD_LENGTH', () => {
  it('至少 8 位（客户端是唯一能校验密码强度的地方，服务端只看到 64 位 hex）', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
  })
})

describe('validateCredentials', () => {
  it('合法邮箱 + 8 位密码通过', () => {
    expect(validateCredentials('parent@example.com', 'hunter22')).toBeNull()
  })

  it('邮箱格式不对 → badEmail（正则与服务端 functions/lib/crypto.ts 的 isValidEmail 逐字一致）', () => {
    expect(validateCredentials('parent', 'hunter22')).toBe('badEmail')
    expect(validateCredentials('parent@localhost', 'hunter22')).toBe('badEmail')
    expect(validateCredentials('a b@example.com', 'hunter22')).toBe('badEmail')
    expect(validateCredentials('', 'hunter22')).toBe('badEmail')
  })

  it('密码短于 8 位 → badPassword（deriveAuthKey 对 "1" 也输出合法 hex，服务端拦不住）', () => {
    expect(validateCredentials('parent@example.com', '1')).toBe('badPassword')
    expect(validateCredentials('parent@example.com', 'hunter2')).toBe('badPassword')
  })

  it('两者都错时先报邮箱（一次只提示一个问题，家长不用猜）', () => {
    expect(validateCredentials('nope', '1')).toBe('badEmail')
  })

  it('邮箱首尾空格不影响判定（与 normalizeEmail 口径一致）', () => {
    expect(validateCredentials('  parent@example.com ', 'hunter22')).toBeNull()
  })
})
