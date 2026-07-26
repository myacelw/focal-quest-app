import { describe, it, expect } from 'vitest'

// 用 Vite 的 ?raw 拿源文件文本（本仓没装 @types/node，node:fs 会让 tsc 报 TS2307）。
// 参考 src/layout/css-contract.test.ts 的同类做法。
import settings from '../SettingsPage.tsx?raw'
import card from '../sync/CloudSyncCard.tsx?raw'

/**
 * 锚定一个真实修过的 bug：在设置页内登录后，管理后台入口不出现。
 *
 * 成因：CloudSyncCard 就嵌在设置页里，页内登录不会让 SettingsPage 重新挂载，
 * 而读 isAdmin 的 effect 依赖是 []，于是那次登录的 isAdmin 永远读不到，
 * 入口要切到别的页再回来才显示。实测确认过：登录后 false，切走再回来 true。
 *
 * 这两条断言防的是"有人顺手把依赖改回 []"或"删掉回调"——
 * 光看代码很难想到这两处是一根链子，改坏了也不会有任何测试变红。
 */
describe('管理入口在页内登录后要立刻出现', () => {
  it('SettingsPage 读 isAdmin 的 effect 依赖账号变动计数，而不是空数组', () => {
    // 允许空格差异，但必须以 accountRev 为依赖
    expect(settings).toMatch(/getAccount\(\)[\s\S]{0,120}?\}\s*,\s*\[\s*accountRev\s*\]/)
  })

  it('SettingsPage 把 onAccountChange 传给了 CloudSyncCard', () => {
    expect(settings).toMatch(/<CloudSyncCard[\s\S]{0,200}?onAccountChange=/)
  })

  it('CloudSyncCard 在 refresh 里回调 onAccountChange（登录/注册/退出都走 refresh）', () => {
    expect(card).toContain('onAccountChange?.()')
  })
})
