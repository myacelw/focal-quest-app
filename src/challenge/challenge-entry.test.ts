import { describe, it, expect } from 'vitest'

// ?raw 源文本核对（本仓没装 @types/node）；参考 src/admin/admin-entry.test.ts。
import home from '../HomePage.tsx?raw'
import app from '../App.tsx?raw'

/**
 * 锚定"挑战入口的可见性"这根链子：解锁判定写在首页、回调从 App 传下来、挑战页不进 NAV。
 * 这三处任何一处被顺手改坏，都会让挑战变成"随时可玩"——那就本末倒置（spec §2 的核心决策）。
 */
describe('挑战入口只在当天练完时出现', () => {
  it('首页把 ChallengeCard 挡在 challengeUnlocked(stats) 后面', () => {
    expect(home).toMatch(/challengeUnlocked\(stats\)\s*&&\s*<ChallengeCard/)
  })

  it('首页把 onOpenChallenge 透给入口卡', () => {
    expect(home).toMatch(/<ChallengeCard[\s\S]{0,80}?onOpen=\{onOpenChallenge\}/)
  })

  it('App 有 challenge 这个 View 并接了 ChallengePage', () => {
    expect(app).toMatch(/type View =[^\n]*'challenge'/)
    expect(app).toMatch(/view === 'challenge' && <ChallengePage/)
    expect(app).toContain('onOpenChallenge={() => setView(\'challenge\')}')
  })

  it('挑战页不进常驻导航（NAV 只有 5 项，且不含 challenge）', () => {
    const nav = app.slice(app.indexOf('const NAV'), app.indexOf('export function App'))
    expect(nav).not.toContain('challenge')
    expect(nav.match(/key:\s*'/g)?.length).toBe(5)
  })

  it('App 的初始 View 是 home（防手测时临时改成 challenge 忘改回来）', () => {
    expect(app).toContain("useState<View>('home')")
  })
})
