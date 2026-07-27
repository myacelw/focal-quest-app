import { describe, it, expect } from 'vitest'

// 用 Vite 的 ?raw 拿源文件文本（本仓没装 @types/node，node:fs 会让 tsc 报 TS2307）。
// 参考 src/layout/css-contract.test.ts 与 src/admin/admin-entry.test.ts 的同类做法。
import page from './ChallengePage.tsx?raw'

/**
 * UI 不可渲染测试（本仓 vitest environment 是 node、没有 jsdom），
 * 但"挑战页有没有踩到医学边界与数据边界"可以用源文本锚住。
 */
describe('挑战页的外壳与边界契约', () => {
  it('复用训练页三段外壳与两条提示（手机竖屏靠既有断点自动适配，不新造断点）', () => {
    for (const cls of [
      'fzp-train', 'fzp-train-top', 'fzp-stage', 'fzp-answer', 'fq-dpad',
      // 训练页在 .fzp-train 里同时渲染这两条：矮屏警告 + 手机横屏"竖屏更好用"。
      // 挑战页少哪一条，迭代 3d 建立的口径就在新页面上缺一半（CLAUDE.md 关键决策 #1）。
      'fzp-rotate-hint', 'fzp-tiny-warn',
    ]) {
      expect(page, `缺 ${cls}`).toContain(cls)
    }
  })

  it('不写死导航高度、不自造媒体查询（断点只该在 index.css 里）', () => {
    expect(page).not.toContain('calc(100vh')
    expect(page).not.toContain('@media')
  })

  it('医学：视标链上没有 transform scale（视标恒为 毫米 × 标定）', () => {
    expect(page).toContain('sizeMm * pxPerMm')
    expect(page).not.toMatch(/scale\(/)
  })

  it('医学边界②：翻拍时长必须过 challengeFlipMs，不许直接用 fzp.flipMs 的原值', () => {
    expect(page).toContain('challengeFlipMs(')
    // 白名单而非黑名单：页面里**每一处** `const flipMs = …` 都必须经过 challengeFlipMs(。
    // 原先只禁了 `= Number(lsGet('fzp.flipMs'))` 这一种确切写法，换个写法（Number(x)||900、
    // 先取变量再赋值……）就能绕过去，等于闸门形同虚设。
    const decls = page.match(/const\s+flipMs\s*=\s*[^\n]*/g)
    expect(decls, '挑战页必须恰好有一处 flipMs 定义').toHaveLength(1)
    expect(decls).toEqual([expect.stringContaining('challengeFlipMs(')])
  })

  it('数据：不落 Dexie、不打卡、不给积分/勋章/怪兽、不写 outbox（挑战不入云同步）', () => {
    // 具体函数名保留作可读性……
    for (const forbidden of ['saveSession', 'doCheckIn', 'syncBadges', 'captureMonster', 'addRedemption']) {
      expect(page, `不该出现 ${forbidden}`).not.toContain(forbidden)
    }
    // ……但真正的闸门是这两条正则：黑名单挡不住 db.checkins.put / db.badges.bulkPut /
    // db.monsters.add / db.sessions.bulkPut，也挡不住 src/data/api.ts 那 7 个 pushXxx（写
    // outbox 就等于进云同步）。当前代码是干净的，这两条防的是将来顺手加落库的人。
    expect(page, '禁止任何 Dexie 写操作').not.toMatch(/db\.\w+\.(put|add|bulkPut|bulkAdd|update|delete|clear|modify)\b/)
    expect(page, '禁止调用 pushXxx（写 outbox = 进云同步）').not.toMatch(/\bpush[A-Z]\w*\(/)
  })

  it('超时不复用答错音效（spec §4.5：超时=未答、不算错）', () => {
    expect(page).toContain("'timeout'")
    // 若有人把三元收回成 `kind === 'correct' ? 'correct' : 'wrong'`，这条会红
    expect(page).not.toMatch(/kind\s*===\s*'correct'\s*\?\s*'correct'\s*:\s*'wrong'/)
  })

  it('数据：只读 sessions 取节奏基准，最高分只走 localStorage 层', () => {
    expect(page).toContain('db.sessions.toArray()')
    expect(page).toContain('writeBestIfHigher(')
  })
})
