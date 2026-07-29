import { describe, it, expect } from 'vitest'
import { adminGate } from './auth'

describe('adminGate', () => {
  // 这三条是全仓唯一进 CI 质量门的鉴权锚点：deploy-cf.yml 只跑 npm test / typecheck / build，
  // 从不跑 npm run test:api，所以集成断言拦不住"谁删掉 isAdmin 判断"这种回归。
  it('没登录 → unauthorized（401）', () => {
    expect(adminGate(null)).toBe('unauthorized')
  })

  it('登录了但不是管理员 → forbidden（403，与 401 刻意分开）', () => {
    expect(adminGate({ isAdmin: false })).toBe('forbidden')
  })

  it('管理员 → ok', () => {
    expect(adminGate({ isAdmin: true })).toBe('ok')
  })
})
