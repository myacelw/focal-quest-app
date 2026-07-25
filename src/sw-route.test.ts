import { describe, it, expect } from 'vitest'
import { shouldBypass } from './sw-route'

describe('shouldBypass', () => {
  it('放行 /api/ 下的请求（云同步必须直连网络，不能吃 SW 缓存）', () => {
    expect(shouldBypass('/api/sync/pull')).toBe(true)
    expect(shouldBypass('/api/auth/login')).toBe(true)
  })

  it('不放行普通静态资源（它们要走 cache-first 才能离线）', () => {
    expect(shouldBypass('/index.html')).toBe(false)
    expect(shouldBypass('/assets/index-abc123.js')).toBe(false)
    expect(shouldBypass('/badges/sheet1.webp')).toBe(false)
    expect(shouldBypass('/models/vosk-model.tar.gz.part00')).toBe(false)
  })

  it('不把名字里含 api 的静态资源误判为接口', () => {
    expect(shouldBypass('/assets/api-helper-abc.js')).toBe(false)
    expect(shouldBypass('/rapid.png')).toBe(false)
  })
})
