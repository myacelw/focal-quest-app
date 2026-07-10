# 小优化三件套 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ①孩子可撤回待确认兑换；②家长周报显示本周捕获怪兽数和已兑现奖励；③设置页生成每日提醒日历文件（.ics）。

**Architecture:** 三件独立小功能。撤回复用现有 `cancelRedemption`；周报新增纯函数 `weeklyExtras`（与训练周报同文件、不改原函数）+ 统计页渲染；提醒新增纯函数 `buildReminderIcs` + 设置页薄卡片。沿用惯例：纯逻辑 TDD，UI/服务薄层 tsc + preview 验证。零后端改动。

**Tech Stack:** TypeScript + React + Vite + Dexie + vitest。

## Global Constraints

- 与用户交流、代码注释一律**简体中文**；技术标识符英文。
- 新增 UI 文案必须 **zh + en 双语**（`src/i18n.tsx` 的 `ZH`/`EN` 字典都加），否则中文裸显 key（兜底链 `DICT[lang][key] ?? DICT.zh[key] ?? key`）。
- 日期用 `src/data/date-utils.ts` 的本地 `YYYY-MM-DD`；周划分用 `src/stats/period.ts` 的 `weekKey`（周一起始）。
- 测试命令用 `node node_modules/vitest/vitest.mjs run <file>`；类型检查用 `node node_modules/typescript/bin/tsc --noEmit`（此机器 npx 慢，勿用）。
- 撤回复用现有 `cancelRedemption(id: number): Promise<void>`（`src/rewards/rewards-service.ts`），不新增状态、不加二次确认。
- 提醒 .ics 用浮动本地时间（无 TZID）、CRLF 行尾、`RRULE:FREQ=DAILY`。
- 零后端改动。

### 共享签名

```ts
// src/stats/weekly-report.ts 新增
export interface WeeklyExtras { monstersThisWeek: number; redeemedTitlesThisWeek: string[] }
export function weeklyExtras(
  monsters: { capturedAt: number }[],
  redemptions: RedemptionRow[],
  today: string,
): WeeklyExtras

// src/reminder/ics.ts 新增
export function buildReminderIcs(startDate: string, time: string, summary: string, description: string): string
```

---

## Task 1: weeklyExtras 纯函数（TDD）

**Files:**
- Modify: `src/stats/weekly-report.ts`
- Test: `src/stats/weekly-report.test.ts`

**Interfaces:**
- Consumes: `RedemptionRow`（`src/data/db`）、`weekKey`（`./period`）、`toDateStr`（`../data/date-utils`）。
- Produces: `WeeklyExtras`、`weeklyExtras`（Task 4 StatsPage 消费）。

- [ ] **Step 1: 写失败测试**

在 `src/stats/weekly-report.test.ts` 末尾追加（先看文件末尾现有 import 风格，补 import）：

```ts
import { weeklyExtras } from './weekly-report'
import type { RedemptionRow } from '../data/db'

function red(over: Partial<RedemptionRow>): RedemptionRow {
  return { kind: 'reward', title: 'x', cost: 10, createdAt: 0, createdDate: '2026-07-08', status: 'fulfilled', ...over }
}
// 2026-07-08 是周三，本周（周一起始）= 2026-07-06..07-12
const TODAY = '2026-07-08'
const inWeek = new Date('2026-07-08T10:00:00').getTime()
const lastWeek = new Date('2026-06-30T10:00:00').getTime()

describe('weeklyExtras', () => {
  it('统计本周捕获怪兽数（按 capturedAt 落在本周）', () => {
    const r = weeklyExtras(
      [{ capturedAt: inWeek }, { capturedAt: inWeek }, { capturedAt: lastWeek }],
      [], TODAY,
    )
    expect(r.monstersThisWeek).toBe(2)
  })
  it('只收本周 已兑现 reward 的名称', () => {
    const r = weeklyExtras([], [
      red({ title: '看动画', status: 'fulfilled', createdDate: '2026-07-07' }),
      red({ title: '待确认的', status: 'pending', createdDate: '2026-07-07' }),   // 非 fulfilled 排除
      red({ title: '补签', kind: 'repair', status: 'fulfilled', createdDate: '2026-07-07' }), // 非 reward 排除
      red({ title: '上周的', status: 'fulfilled', createdDate: '2026-06-30' }),   // 跨周排除
    ], TODAY)
    expect(r.redeemedTitlesThisWeek).toEqual(['看动画'])
  })
  it('空输入返回 0 与空数组', () => {
    const r = weeklyExtras([], [], TODAY)
    expect(r).toEqual({ monstersThisWeek: 0, redeemedTitlesThisWeek: [] })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run src/stats/weekly-report.test.ts`
Expected: FAIL（`weeklyExtras` 未导出）

- [ ] **Step 3: 实现**

`src/stats/weekly-report.ts`：顶部 import 补 `RedemptionRow` 与 `toDateStr`（`weekKey` 已 import）：

```ts
import type { SessionRow, RedemptionRow } from '../data/db'
import { weekKey } from './period'
import { addDays, toDateStr } from '../data/date-utils'
```

文件末尾追加：

```ts
export interface WeeklyExtras {
  monstersThisWeek: number
  redeemedTitlesThisWeek: string[]
}

/** 周报的"游戏化成果"补充：本周捕获怪兽数 + 本周已兑现奖励名称 */
export function weeklyExtras(
  monsters: { capturedAt: number }[],
  redemptions: RedemptionRow[],
  today: string,
): WeeklyExtras {
  const thisWk = weekKey(today)
  const monstersThisWeek = monsters.filter(
    (m) => weekKey(toDateStr(new Date(m.capturedAt))) === thisWk,
  ).length
  const redeemedTitlesThisWeek = redemptions
    .filter((r) => r.kind === 'reward' && r.status === 'fulfilled' && weekKey(r.createdDate) === thisWk)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((r) => r.title)
  return { monstersThisWeek, redeemedTitlesThisWeek }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node node_modules/vitest/vitest.mjs run src/stats/weekly-report.test.ts`
Expected: PASS（原有 6 + 新增 3）

- [ ] **Step 5: 提交**

```bash
git add src/stats/weekly-report.ts src/stats/weekly-report.test.ts
git commit -m "feat: 周报纯函数 weeklyExtras（本周捕获怪兽数+已兑现奖励），TDD"
```

---

## Task 2: buildReminderIcs 纯函数（TDD）

**Files:**
- Create: `src/reminder/ics.ts`
- Test: `src/reminder/ics.test.ts`

**Interfaces:**
- Produces: `buildReminderIcs(startDate, time, summary, description): string`（Task 5 消费）。

- [ ] **Step 1: 写失败测试**

Create `src/reminder/ics.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildReminderIcs } from './ics'

describe('buildReminderIcs', () => {
  const ics = buildReminderIcs('2026-07-10', '19:00', '该练视力啦', '打开变焦大冒险，练几分钟')

  it('每日重复 + DTSTART 拼接（去分隔符）', () => {
    expect(ics).toContain('RRULE:FREQ=DAILY')
    expect(ics).toContain('DTSTART:20260710T190000')
  })
  it('注入 SUMMARY / DESCRIPTION 与提醒 VALARM', () => {
    expect(ics).toContain('SUMMARY:该练视力啦')
    expect(ics).toContain('DESCRIPTION:打开变焦大冒险，练几分钟')
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics).toContain('TRIGGER:PT0M')
  })
  it('合法日历骨架 + CRLF 行尾', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('\r\n')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run src/reminder/ics.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

Create `src/reminder/ics.ts`：

```ts
/**
 * 生成每日重复的日历提醒文件（.ics 文本）。
 * 用浮动本地时间（无 TZID）——每天按墙钟同一时刻触发，无时区漂移，适合"每天晚上 7 点"。
 * @param startDate YYYY-MM-DD（今天）
 * @param time      HH:MM
 */
export function buildReminderIcs(startDate: string, time: string, summary: string, description: string): string {
  const dt = `${startDate.replace(/-/g, '')}T${time.replace(/:/g, '')}00`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FocalQuest//Reminder//EN',
    'BEGIN:VEVENT',
    'UID:focalquest-daily-reminder',
    `DTSTART:${dt}`,
    'RRULE:FREQ=DAILY',
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'BEGIN:VALARM',
    'TRIGGER:PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${summary}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n') + '\r\n'
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node node_modules/vitest/vitest.mjs run src/reminder/ics.test.ts`
Expected: PASS（3 用例）

- [ ] **Step 5: 提交**

```bash
git add src/reminder/ics.ts src/reminder/ics.test.ts
git commit -m "feat: 每日提醒日历文件生成纯函数（RRULE 每日/浮动本地时间），TDD"
```

---

## Task 3: 兑换页撤回按钮

**Files:**
- Modify: `src/rewards/RewardsPage.tsx`
- Modify: `src/i18n.tsx`

**Interfaces:**
- Consumes: `cancelRedemption`（`src/rewards/rewards-service.ts`，已存在）、`reward.revoke` i18n（本任务加）。

- [ ] **Step 1: i18n（zh + en 都加）**

`src/i18n.tsx`：`ZH` 字典 `reward.*` 组里加：

```ts
  'reward.revoke': '撤回',
```

`EN` 字典对应处加：

```ts
  'reward.revoke': 'Undo',
```

- [ ] **Step 2: 撤回按钮**

`src/rewards/RewardsPage.tsx`：import 加 `cancelRedemption`：

```tsx
import { listRewards, getAvailablePoints, requestRedemption, listRedemptions, cancelRedemption } from './rewards-service'
```

历史记录里 pending 项加撤回按钮。将现有历史行渲染改为（在状态文案后，pending 时追加撤回按钮）：

```tsx
        history.map((h) => (
          <div key={h.id} className="fq-card" style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, gap: 8 }}>
            <span>{h.title}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--muted)' }}>{t('reward.cost', { n: h.cost })} · {t(`reward.status.${h.status}`)}</span>
              {h.status === 'pending' && (
                <button className="fq-btn" onClick={async () => { await cancelRedemption(h.id!); await refresh() }}>{t('reward.revoke')}</button>
              )}
            </span>
          </div>
        ))
```

- [ ] **Step 3: 验证 + 提交**

Run: `node node_modules/typescript/bin/tsc --noEmit` → Expected: 0
preview（focal-quest-dev）：设置页加个奖励 → 兑换页申请（可用分下降、记录出现 pending + 撤回按钮）→ 点撤回（状态变已取消、可用分回涨）。console 无 error。**验证后清理播种数据。**

```bash
git add src/rewards/RewardsPage.tsx src/i18n.tsx
git commit -m "feat: 兑换页孩子可撤回待确认兑换（复用 cancelRedemption 退分）"
```

---

## Task 4: 周报卡渲染 extras

**Files:**
- Modify: `src/stats/StatsPage.tsx`
- Modify: `src/i18n.tsx`

**Interfaces:**
- Consumes: `weeklyExtras`（Task 1）、`getOwnedMonsters`（`src/dex/dex-service`）、`listRedemptions`（`src/rewards/rewards-service`）、`stats.weeklyMonsters`/`stats.weeklyRedeemed` i18n（本任务加）。

- [ ] **Step 1: i18n（zh + en 都加）**

`ZH` 字典 `stats.*` 组里加：

```ts
  'stats.weeklyMonsters': '🎁 本周抓 {n} 只怪',
  'stats.weeklyRedeemed': '🏆 兑换了：{titles}',
```

`EN` 字典对应处加：

```ts
  'stats.weeklyMonsters': '🎁 Caught {n} monsters this week',
  'stats.weeklyRedeemed': '🏆 Redeemed: {titles}',
```

- [ ] **Step 2: 取数 + 算 extras**

`src/stats/StatsPage.tsx`：import 加：

```tsx
import { weeklyReport, weeklyExtras, type WeeklyExtras } from './weekly-report'
import { getOwnedMonsters } from '../dex/dex-service'
import { listRedemptions } from '../rewards/rewards-service'
```

组件内加 state + 取数（放在现有 useEffect 附近）：

```tsx
  const [extras, setExtras] = useState<WeeklyExtras>({ monstersThisWeek: 0, redeemedTitlesThisWeek: [] })
  useEffect(() => {
    void Promise.all([getOwnedMonsters(), listRedemptions()]).then(([monsters, reds]) => {
      setExtras(weeklyExtras(monsters, reds, toDateStr(new Date())))
    })
  }, [])
```

- [ ] **Step 3: 周报卡底部渲染**

`src/stats/StatsPage.tsx`：周报紫卡里、建议行（`💡 {t(...suggestionKey)}` 那个 div）之后、卡片闭合 `</div>` 之前，插入：

```tsx
        {(extras.monstersThisWeek > 0 || extras.redeemedTitlesThisWeek.length > 0) && (
          <div style={{ fontSize: 12, marginTop: 8, opacity: 0.92, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {extras.monstersThisWeek > 0 && <div>{t('stats.weeklyMonsters', { n: extras.monstersThisWeek })}</div>}
            {extras.redeemedTitlesThisWeek.length > 0 && <div>{t('stats.weeklyRedeemed', { titles: extras.redeemedTitlesThisWeek.join('、') })}</div>}
          </div>
        )}
```

- [ ] **Step 4: 验证 + 提交**

Run: `node node_modules/typescript/bin/tsc --noEmit` → Expected: 0
preview：eval 往 monsters 播种本周捕获若干 + redemptions 播种本周 fulfilled reward → 统计页周报卡底部出现「🎁 本周抓 N 只怪」「🏆 兑换了：…」；无数据时不显示。console 无 error。**验证后清理播种数据。**

```bash
git add src/stats/StatsPage.tsx src/i18n.tsx
git commit -m "feat: 家长周报融入本周捕获怪兽数与已兑现奖励"
```

---

## Task 5: ReminderCard + 设置页挂载 + i18n

**Files:**
- Create: `src/reminder/ReminderCard.tsx`
- Modify: `src/SettingsPage.tsx`
- Modify: `src/i18n.tsx`

**Interfaces:**
- Consumes: `buildReminderIcs`（Task 2）、`lsGet/lsSet`（`src/data/storage`）、`toDateStr`（date-utils）、`reminder.*` i18n（本任务加）。

- [ ] **Step 1: i18n（zh + en 都加）**

`ZH` 字典追加（`backup.*` 组之后）：

```ts
  // 每日提醒
  'reminder.title': '⏰ 每日提醒',
  'reminder.hint': '添加一个每天到点的日历提醒，帮孩子坚持。iPad 打开下载的文件会弹"添加到日历"',
  'reminder.time': '提醒时间',
  'reminder.add': '添加到日历',
  'reminder.icsSummary': '该练视力啦 👀',
  'reminder.icsDesc': '打开「变焦大冒险」，练几分钟翻转拍',
```

`EN` 字典对应处追加：

```ts
  // Daily reminder
  'reminder.title': '⏰ Daily reminder',
  'reminder.hint': 'Add a daily calendar reminder to help your child keep the habit. Opening the downloaded file on iPad prompts "Add to Calendar"',
  'reminder.time': 'Reminder time',
  'reminder.add': 'Add to calendar',
  'reminder.icsSummary': 'Time for vision training 👀',
  'reminder.icsDesc': 'Open FocalQuest and do a few minutes of flipper training',
```

- [ ] **Step 2: ReminderCard 组件**

Create `src/reminder/ReminderCard.tsx`：

```tsx
import { useState } from 'react'
import { buildReminderIcs } from './ics'
import { lsGet, lsSet } from '../data/storage'
import { toDateStr } from '../data/date-utils'
import { useT } from '../i18n'

/** 设置页：每日提醒卡（生成每日重复的 .ics 日历文件，零后端） */
export function ReminderCard() {
  const t = useT()
  const [time, setTime] = useState(() => lsGet('fzp.reminderTime') || '19:00')

  function onAdd() {
    lsSet('fzp.reminderTime', time)
    const ics = buildReminderIcs(toDateStr(new Date()), time, t('reminder.icsSummary'), t('reminder.icsDesc'))
    const blob = new Blob([ics], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const aEl = document.createElement('a')
    aEl.href = url
    aEl.download = 'focalquest-reminder.ics'
    aEl.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fq-card" style={{ marginTop: 14, textAlign: 'left' }}>
      <div className="fq-card-title">{t('reminder.title')}</div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 12px' }}>{t('reminder.hint')}</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13 }}>{t('reminder.time')}</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--line)' }} />
        <button className="fq-btn" onClick={onAdd}>{t('reminder.add')}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 挂进 SettingsPage**

`src/SettingsPage.tsx`：import 后在 `<BackupCard />` 之后加：

```tsx
import { ReminderCard } from './reminder/ReminderCard'
// JSX：<BackupCard /> 之后
<ReminderCard />
```

- [ ] **Step 4: 验证 + 提交**

Run: `node node_modules/typescript/bin/tsc --noEmit` → Expected: 0
Run: `node node_modules/vitest/vitest.mjs run` → Expected: 全绿
preview：设置页出现「⏰ 每日提醒」卡；改时间为 20:30 → 点添加到日历触发 .ics 下载；`fzp.reminderTime` 持久化为 20:30（eval 查 localStorage）。console 无 error。

```bash
git add src/reminder/ReminderCard.tsx src/SettingsPage.tsx src/i18n.tsx
git commit -m "feat: 设置页每日提醒卡（生成每日重复 .ics 日历文件）"
```

---

## Self-Review 结论

**Spec 覆盖**：撤回兑换（Task 3，复用 cancelRedemption）、周报 extras 纯函数+渲染（Task 1/4）、.ics 纯函数+设置卡（Task 2/5）、i18n 双语（Task 3/4/5）、reminderTime 进备份（Task 5 用 `fzp.` 前缀，自动被现有备份收集）——全覆盖。

**类型一致**：`WeeklyExtras`/`weeklyExtras` Task 1 定义、Task 4 消费一致；`buildReminderIcs(startDate,time,summary,description)` Task 2 定义、Task 5 调用一致；`cancelRedemption` 沿用现有签名。

**执行顺序**：Task 1/2 纯函数无依赖，Task 3 独立，Task 4 依赖 Task 1，Task 5 依赖 Task 2。按 1→5 顺序安全。

**非单测层**：撤回按钮/周报渲染/.ics 下载/ReminderCard 沿用惯例不写单测，preview 验证；不要引入 fake-indexeddb 等新测试设施。
