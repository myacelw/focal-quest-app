import { describe, it, expect } from 'vitest'

// 用 Vite 的 ?raw 拿源文件文本（本仓没装 @types/node，node:fs 会让 tsc 报 TS2307）。
// 与 src/admin/admin-entry.test.ts、src/layout/css-contract.test.ts 同一套做法。
import app from './App.tsx?raw'

/**
 * 底部导航恒 5 项。
 *
 * 手机竖屏断点 560px 是按「5 项英文导航单行所需 531px」算出来的
 * （见 src/layout/layout-budget.ts 与 css-contract.test.ts）。加第 6 项会让英文导航
 * 折成两行、把 3d 迭代刚修好的手机布局重新弄坏——那次的症状是训练页整体比首屏高
 * 42px、`↓` 方向键有一截在屏外点不到，而且家长完全看不出是导航的锅。
 *
 * 所以卡册、限时挑战、隐私政策、管理后台一律走"页面 + 页内入口卡"，不进 NAV。
 */
describe('底部导航', () => {
  it('恒为 5 项 —— 新功能加入口卡，不许加导航项', () => {
    const block = app.match(/const NAV[^=]*=\s*\[([\s\S]*?)\n\]/)
    expect(block, '没找到 NAV 数组，正则要跟着 App.tsx 的写法更新').not.toBeNull()
    const entries = block![1].match(/\bkey:/g) ?? []
    expect(entries.length).toBe(5)
  })

  it('卡册没有被塞进 NAV（入口在首页，与图鉴并排）', () => {
    const block = app.match(/const NAV[^=]*=\s*\[([\s\S]*?)\n\]/)
    expect(block![1]).not.toContain('cards')
  })
})
