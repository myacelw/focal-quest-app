# 小优化三件套 · 设计文档

日期：2026-07-10
状态：已获用户批准（设计全文呈现无异议）

## 1. 背景与目标

积分兑换、图鉴、验光、备份上线后，补三个"半天量级"的体验缺口：

1. **孩子撤回待确认兑换**：现在孩子申请兑换后只能等家长处理、自己不能撤回，预扣的分一直被占。补一个撤回入口。
2. **家长周报融入新数据**：统计页周报只讲训练；把"本周抓了几只怪、兑换了什么"给家长看，让新功能的成果被看见。
3. **每日训练提醒**：坚持链路最后一个缺口。零后端做法——生成每日重复的日历文件（.ics），一次设置每天提醒，不碰 Web Push。

三件都很小、互相独立，打包一个迭代。

## 2. 功能一：孩子撤回待确认兑换

- 兑换页（`RewardsPage`）的兑换记录里，`status === 'pending'` 的那条右侧加「撤回」按钮。
- **复用现有 `cancelRedemption(id)`**（`src/rewards/rewards-service.ts`，置 `status='cancelled'` + 双写后端，可用积分随之回涨）——撤回与家长取消效果一致，不新增状态。
- 撤回后 `refresh()`，可用积分立即回涨、该条状态显示「已取消」。
- 不加二次确认（孩子自己的低风险操作、可重新申请），保持顺手。
- 已被家长兑现（`fulfilled`）的不再是 pending，自然没有撤回按钮，无冲突。

## 3. 功能二：家长周报融入新数据

### 3.1 纯函数（`src/stats/weekly-report.ts` 同文件新增，训练周报本身不改）

```ts
export interface WeeklyExtras {
  monstersThisWeek: number          // 本周捕获怪兽数
  redeemedTitlesThisWeek: string[]  // 本周已兑现的奖励名称
}
export function weeklyExtras(
  monsters: { capturedAt: number }[],
  redemptions: RedemptionRow[],
  today: string,
): WeeklyExtras
```

- 本周 = `weekKey(today)`（周一起始，复用 `period.ts`）。
- `monstersThisWeek`：`monsters` 中 `weekKey(toDateStr(new Date(capturedAt))) === thisWk` 的计数。
- `redeemedTitlesThisWeek`：`redemptions` 中 `kind==='reward'` 且 `status==='fulfilled'` 且 `weekKey(createdDate)===thisWk` 的 `title` 列表（按 createdAt 升序）。

### 3.2 展示（`StatsPage.tsx` 周报紫卡底部）

- 卡片底部加一行：`🎁 本周抓 {n} 只怪`（n>0 才显示）。
- 若 `redeemedTitlesThisWeek` 非空，再加一行：`🏆 兑换了：{titles.join('、')}`。
- 两者都空则不渲染，不占版面。
- StatsPage 需新取 `getOwnedMonsters()`（dex-service）+ `listRedemptions()`（rewards-service）算 extras。

## 4. 功能三：每日训练提醒（.ics）

### 4.1 纯函数（`src/reminder/ics.ts`）

```ts
export function buildReminderIcs(
  startDate: string,   // YYYY-MM-DD，今天
  time: string,        // HH:MM
  summary: string,
  description: string,
): string
```

生成每日重复的日历事件（浮动本地时间，无 TZID，避免时区漂移）：

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//FocalQuest//Reminder//EN
BEGIN:VEVENT
UID:focalquest-daily-reminder
DTSTART:<startDate 去横线>T<time 去冒号>00
RRULE:FREQ=DAILY
SUMMARY:<summary>
DESCRIPTION:<description>
BEGIN:VALARM
TRIGGER:PT0M
ACTION:DISPLAY
DESCRIPTION:<summary>
END:VALARM
END:VEVENT
END:VCALENDAR
```

- 行尾用 CRLF（`\r\n`，iCalendar 规范）。DTSTART 例：`20260710T190000`。

### 4.2 UI（设置页新卡片「⏰ 每日提醒」）

- 时间选择器 `<input type="time">`，值存 `fzp.reminderTime`（默认 `19:00`）——`fzp.` 前缀自动进备份文件。
- 「添加到日历」按钮：`buildReminderIcs(toDateStr(today), reminderTime, summary, description)` → `Blob(type:'text/calendar')` 下载 `focalquest-reminder.ics`。
- 说明文案：一次添加，日历每天到点提醒；iPad 打开 .ics 会弹"添加到日历"。

## 5. 代码结构

- `src/stats/weekly-report.ts`：加 `WeeklyExtras` + `weeklyExtras`（纯函数，TDD）。
- `src/reminder/ics.ts`：`buildReminderIcs`（纯函数，TDD）。
- `src/reminder/ReminderCard.tsx`：设置页提醒卡（薄 UI）。
- `src/rewards/RewardsPage.tsx`：pending 项加撤回按钮（复用 cancelRedemption）。
- `src/stats/StatsPage.tsx`：周报卡渲染 extras。
- `src/SettingsPage.tsx`：挂 `<ReminderCard />`。
- `src/i18n.tsx`：新增 zh/en key。
- 零后端改动（撤回复用现有 /redemptions 双写；.ics 纯前端）。

## 6. 测试策略

- **TDD**（纯函数）：
  - `weeklyExtras`：本周怪兽计数、本周兑现名称过滤、跨周/非 fulfilled/非 reward 排除、空输入。
  - `buildReminderIcs`：含 `RRULE:FREQ=DAILY`、DTSTART 拼接正确（date+time 去分隔符）、SUMMARY/DESCRIPTION 注入、CRLF 行尾。
- **不单测**（薄层惯例）：撤回按钮、周报渲染、.ics 下载、ReminderCard——preview 行为验证 + tsc + 全量单测不回归。

## 7. 明确不做（本版边界）

撤回二次确认、周报历史留存、提醒的服务端推送/Web Push、多提醒时段、.ics 里的复杂重复规则（工作日/间隔）、撤回与家长取消在历史里的区分展示。

## 8. 风险与开放点

- **.ics 浮动时间**：不带 TZID 的浮动本地时间在跨时区旅行时按新时区的墙钟触发——对每日训练提醒可接受（就是"每天晚上 7 点"）。
- **iPad 打开 .ics 体验**：Safari/文件 App 打开会弹添加到日历，主流 iOS 版本支持；若个别版本不弹，属系统行为，非本功能可控。
- **撤回竞态**：孩子撤回与家长兑现并发——单用户本机场景，末次写入胜，忽略。
