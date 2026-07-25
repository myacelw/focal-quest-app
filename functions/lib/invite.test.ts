import { describe, it, expect } from 'vitest'
import { genInviteCode, isValidInviteCodeShape, normalizeInviteCode } from './invite'

describe('genInviteCode', () => {
  it('生成 8 位大写码', () => {
    expect(genInviteCode()).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('不含易混字符 O/0/I/1/L（家长要手抄或口述给亲友）', () => {
    // 用恒定 rand 探每一个可能位置，确保字符表本身干净
    for (let i = 0; i < 40; i++) {
      const code = genInviteCode(() => i / 40)
      expect(code).not.toMatch(/[O0I1L]/)
    }
  })

  it('两次调用不同（真随机源）', () => {
    expect(genInviteCode()).not.toBe(genInviteCode())
  })

  it('rand 返回定值时结果可复现（便于测试注入）', () => {
    expect(genInviteCode(() => 0)).toBe(genInviteCode(() => 0))
  })
})

describe('normalizeInviteCode', () => {
  it('去空格并大写（用户手抄的码可能带空格或小写）', () => {
    expect(normalizeInviteCode(' abcdefgh ')).toBe('ABCDEFGH')
  })
})

describe('isValidInviteCodeShape', () => {
  it('接受合法形状', () => {
    expect(isValidInviteCodeShape('ABCDEFGH')).toBe(true)
  })

  it('接受小写与空格输入（用户手抄难免，形状校验前应已归一）', () => {
    expect(isValidInviteCodeShape(' abcdefgh ')).toBe(true)
  })

  it('拒绝长度不对或含非法字符的输入', () => {
    expect(isValidInviteCodeShape('ABC')).toBe(false)
    expect(isValidInviteCodeShape('ABCDEFGHI')).toBe(false)
    expect(isValidInviteCodeShape('ABCDEF-H')).toBe(false)
    expect(isValidInviteCodeShape('')).toBe(false)
  })
})
