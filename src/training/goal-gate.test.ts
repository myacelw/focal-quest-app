import { describe, it, expect } from 'vitest'

// 用 Vite 的 ?raw 拿源文件文本（本仓没装 @types/node，node:fs 会让 tsc 报 TS2307）。
// 本仓 vitest 是 environment: 'node'、没有 jsdom，组件渲染测不了，
// 源文本是"训练页有没有踩到门槛边界"唯一能自动化的闸门。
// 参考 src/challenge/challenge-shell.test.ts 与 src/layout/css-contract.test.ts。
import page from './TrainingPage.tsx?raw'
import app from '../App.tsx?raw'

/** 不达标分支的起始锚点（渲染层用的是 `checkin.outcome`，不会撞上） */
const BELOW = "if (result.outcome === 'below-goal') {"

/**
 * 截出 below-goal 分支的**确切**函数体。
 * 刻意不用"从锚点起数 N 个字符"那种窗口——分支体只有 200 多字符，窗口稍微开大一点就会
 * 越过 `}` 把后面的 `captureDailyOnCheckin(...)` 一并吞进来，于是"不达标不许发保底怪"
 * 这条断言会在代码完全正确时报红，排查成本极高。按闭合花括号截才是稳的。
 */
function belowGoalBranch(src: string): string {
  const i = src.indexOf(BELOW)
  expect(i, '缺少 below-goal 分支').toBeGreaterThan(-1)
  const end = src.indexOf('\n    }', i) // 分支闭合花括号：4 空格缩进（组件内函数体里的 if）
  expect(end, 'below-goal 分支没有闭合（缩进变了？）').toBeGreaterThan(i)
  return src.slice(i, end)
}

describe('训练完成门槛在训练页的接线契约', () => {
  it('doCheckIn 必须带上真实时长（漏传门槛就按默认 180 算，与实际训练时长脱节）', () => {
    expect(page).toContain('doCheckIn(roundDateRef.current, session.durationSec)')
    expect(page, '不许再出现只传一个参数的旧调用').not.toMatch(/doCheckIn\([^,)]*\)/)
  })

  it('一轮训练用同一个日期：saveSession / doCheckIn / 保底怪都走 roundDateRef', () => {
    // 跨零点时左眼节落到昨天、右眼节落到今天，correctToday 只剩右眼那一节（3 分钟档
    // 大概率 20-40 个，而门槛是整次的 30）→ 可能整轮判 below-goal，而昨天同样没写打卡行
    // （doCheckIn 从未在零点前被调用）→ 两天都没打卡、连续天数直接断，孩子却真练满了 6 分钟。
    expect(page).toContain('const roundDateRef = useRef(')
    expect(page, 'roundDateRef 必须在左眼节开始时刷新').toMatch(/eye === 'left'[\s\S]{0,200}roundDateRef\.current = toDateStr\(new Date\(\)\)/)
    expect(page).toContain('date: roundDateRef.current,')           // saveSession
    expect(page).toContain('captureDailyOnCheckin(false, roundDateRef.current')
    expect(page, '落库日期不许再用落库时刻现算').not.toContain('date: toDateStr(new Date()),')
  })

  it('时长只能从 goal.ts 的 readDurationSec 读（本地再写一份必然与门槛口径漂移）', () => {
    expect(page).toContain("from './goal'")
    expect(page).toContain('readDurationSec')
    expect(page, '训练页不许自己再定义 readDurationSec').not.toMatch(/function\s+readDurationSec\s*\(/)
    expect(page, '不许绕过 goal.ts 直接读 fzp.durationSec').not.toContain("lsGet('fzp.durationSec')")
  })

  it('不达标分支存在，且在发放任何完成奖励之前 return', () => {
    const branch = belowGoalBranch(page)
    expect(branch).toContain('setCheckin(result)')
    expect(branch).toContain('return')
    expect(branch, '不达标不许发保底怪').not.toContain('captureDailyOnCheckin')
    expect(branch, '不达标不许算皮肤解锁').not.toContain('newlyUnlockedSkins')
    expect(branch, '不达标不许放打卡完成音').not.toContain("playSfx('checkin')")
  })

  it('保底怪与皮肤解锁各只有一处，且挂在 checked-in 上', () => {
    expect(page.match(/captureDailyOnCheckin\(/g)).toHaveLength(1)
    expect(page.match(/newlyUnlockedSkins\(/g)).toHaveLength(1)
    expect(page).toContain("result.outcome === 'checked-in'")
  })

  it('勋章照常判定：syncBadges 必须在 below-goal 分流之前调用', () => {
    // 勋章判据来自 sessions 的跨天累计，与"今天算不算完成"无关。
    // 挪到分流之后 = 不达标日的勋章被推迟到下次打卡，unlockedAt 从此失真，
    // 而 CLAUDE.md 明写"勋章/怪兽取最早——首次达成时刻才是正确语义"。
    // 注意找的是 `syncBadges(` 带括号的调用，顶部 import 里那个 `syncBadges,` 不会误命中
    const iBadge = page.indexOf('syncBadges(')
    const iBranch = page.indexOf(BELOW)
    expect(iBadge, '找不到 syncBadges 调用').toBeGreaterThan(-1)
    expect(iBranch, '找不到 below-goal 分支').toBeGreaterThan(-1)
    expect(iBadge).toBeLessThan(iBranch)
  })

  it('restartRound 的复位清单一条都不能少（漏一条的后果都很隐蔽，见 spec §8.2）', () => {
    const m = page.match(/function restartRound\(\)[\s\S]*?\n  \}/)
    expect(m, '缺少 restartRound').not.toBeNull()
    const body = m![0]
    for (const line of [
      'savedRef.current = false',
      'seqRef.current = 0',
      'targetShownAtRef.current = 0',
      'sumReactionRef.current = 0',
      'reactionCountRef.current = 0',
      'setCheckin(null)',
      'setNewBadges([])',
      'setNewSkins([])',
      'setCapturedThisSession([])',
      'setLastAnswer(null)',
      'setComboFx(null)',
      'setEggCaptureFx(null)',
      'setPaused(false)',
      'roundDateRef.current = toDateStr(new Date())',
      "createSession('left', readDurationSec())",
    ]) {
      expect(body, `restartRound 漏了 ${line}`).toContain(line)
    }
  })

  it('刻意不用 key 重挂载来实现「重来」', () => {
    // 卸载会跑 voskRef.current?.stop()，而 vosk-single 的 stop() 清空单例 →
    // 重挂载要重拉 3 个模型分片、拼 60MB Blob、worker 重新解压。
    // 那正是 commit 89743b6「iPad 换眼时白屏退出——vosk 模型并发加载把内存打爆」的路径。
    expect(app).toContain('<TrainingPage onHome=')
    // ⚠️ 不能用 /<TrainingPage[^>]*\bkey=/ ——实际写法是 `onHome={() => setView('home')}`，
    // 箭头函数里的 `>` 会让 [^>]* 在 `=>` 处停住，正则只扫到 `<TrainingPage onHome={() `，
    // 于是将来有人写 `<TrainingPage onHome={…} key={n} />` 这条闸门照样绿（评审 minor #8）。
    // 先按整个标签截出来再断言才是稳的。
    const i = app.indexOf('<TrainingPage')
    expect(i, '找不到 <TrainingPage').toBeGreaterThan(-1)
    const tag = app.slice(i, app.indexOf('/>', i))
    expect(tag, 'App 不许给 TrainingPage 加 key').not.toContain('key=')
  })
})
