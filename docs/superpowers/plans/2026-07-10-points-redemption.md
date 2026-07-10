# 积分兑换现实奖励 + 补签卡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给积分开两个消耗出口——孩子用积分兑换家长自定义的现实奖励（家长确认制），以及花积分补回漏练一天以保护连续天数。

**Architecture:** 现有 `totalPoints`（累计赚取，皮肤解锁依赖，单调不减）完全不动；新增独立"消耗账本"表 `redemptions`，可用积分 = 累计赚取 − Σ(未取消消耗)。所有判定逻辑放纯函数层（`ledger.ts`）做 TDD；Dexie 读写与 React UI 保持薄封装、不单测（沿用本仓库 `checkin.ts`/`dex-service.ts` 的既定模式——只测纯逻辑）。补签通过给漏掉那天补插一条 checkin 行让 streak 链接续。

**Tech Stack:** TypeScript + React + Vite + Dexie(IndexedDB) + Node/node:sqlite 后端双写 + vitest。

## Global Constraints

- 与用户交流、代码注释一律**简体中文**；技术标识符英文。
- **绝不修改 `totalPoints` 语义**（累计赚取值，皮肤/彩蛋/勋章依赖）。花积分只记入 `redemptions` 账本，不减 `totalPoints`。
- 新增 UI 文案必须 **zh + en 双语**（`src/i18n.tsx` 的 `ZH`/`EN` 两个字典都要加），否则中文界面会裸显 key（translate 兜底链 `DICT[lang][key] ?? DICT.zh[key] ?? key`）。
- 日期一律用 `src/data/date-utils.ts` 的本地 `YYYY-MM-DD` 约定，不引第三方日期库。
- 后端双写 best-effort：`src/data/api.ts` 的 `post()` 在 `MODE==='test'` 或 `VITE_BACKEND==='off'` 时静默不发；后端没开不影响离线。
- 常驻导航保持 5 项不变（首页/训练/统计/勋章/设置）；兑换页走"非导航视图"（同标定/语音，从首页卡片进入）。
- 补签规则：只补**恰好漏 1 天**（`daysBetween(lastCheckin, today) === 2`）；**每月上限 2 次**（本地日历月）；补签价 `REPAIR_COST` 常量（本版 50）。
- 兑换扣分时机：**申请即预扣**（记录 status='pending' 即计入消耗），家长确认不再动可用，取消则退款。

### 共享类型（所有任务以此为准）

```ts
// src/data/db.ts 新增
export interface RewardRow {
  id?: number           // ++id 自增
  title: string
  cost: number
  active: boolean       // 软删：删除即置 false，历史兑换的名称快照不受影响
  createdAt: number
}
export interface RedemptionRow {
  id?: number           // ++id 自增
  kind: 'reward' | 'repair'
  title: string         // 名称快照
  cost: number
  createdAt: number
  createdDate: string   // 本地 YYYY-MM-DD，供按月计数（补签上限）
  status: 'pending' | 'fulfilled' | 'cancelled'
  fulfilledAt?: number
  repairDate?: string   // kind='repair' 时 = 补的是哪天（漏掉的那天）
}
```

```ts
// src/rewards/ledger.ts 对外签名
export const REPAIR_COST: number                       // 50
export function availablePoints(totalEarned: number, redemptions: RedemptionRow[]): number
export function monthRepairCount(redemptions: RedemptionRow[], monthStr: string): number   // monthStr = 'YYYY-MM'
export type RepairReason = 'not-broken' | 'no-points' | 'month-limit'
export interface RepairEligibility { ok: boolean; reason?: RepairReason }
export function canRepair(p: {
  lastCheckinDate: string | null
  today: string
  monthRepairCount: number
  available: number
  cost: number
}): RepairEligibility
export function buildRepairCheckin(
  lastReal: { streak: number; totalPoints: number },
  missedDate: string,
): CheckinRow                                            // { date: missedDate, streak: lastReal.streak+1, dailyPoints: 0, totalPoints: lastReal.totalPoints }
```

```ts
// src/data/date-utils.ts 新增
export function daysBetween(aStr: string, bStr: string): number   // bStr - aStr，单位天
export function monthOf(dateStr: string): string                  // 'YYYY-MM-DD' → 'YYYY-MM'
```

---

## Task 1: date-utils 新增 daysBetween / monthOf

**Files:**
- Modify: `src/data/date-utils.ts`
- Test: `src/data/date-utils.test.ts`

**Interfaces:**
- Produces: `daysBetween(aStr, bStr): number`、`monthOf(dateStr): string`（Task 3 的 ledger、Task 4 的 service 都要用）。

- [ ] **Step 1: 追加失败测试**

在 `src/data/date-utils.test.ts` 末尾（最后一个 `})` 之前的合适位置，新增：

```ts
import { daysBetween, monthOf } from './date-utils'

describe('daysBetween', () => {
  it('相邻两天差 1', () => {
    expect(daysBetween('2026-07-01', '2026-07-02')).toBe(1)
  })
  it('漏一天=差 2（上次打卡→今天）', () => {
    expect(daysBetween('2026-07-01', '2026-07-03')).toBe(2)
  })
  it('同一天差 0', () => {
    expect(daysBetween('2026-07-05', '2026-07-05')).toBe(0)
  })
  it('跨月正确（无时区漂移）', () => {
    expect(daysBetween('2026-06-30', '2026-07-01')).toBe(1)
  })
  it('反向为负', () => {
    expect(daysBetween('2026-07-03', '2026-07-01')).toBe(-2)
  })
})

describe('monthOf', () => {
  it('取 YYYY-MM', () => {
    expect(monthOf('2026-07-10')).toBe('2026-07')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run src/data/date-utils.test.ts`
Expected: FAIL（`daysBetween is not a function` / `monthOf is not a function`）

- [ ] **Step 3: 实现**

在 `src/data/date-utils.ts` 末尾追加：

```ts
/** bStr - aStr 的天数差（UTC 解析，纯日期算术，无时区漂移） */
export function daysBetween(aStr: string, bStr: string): number {
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((parse(bStr) - parse(aStr)) / 86400000)
}

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node node_modules/vitest/vitest.mjs run src/data/date-utils.test.ts`
Expected: PASS（原有 6 + 新增 6 = 12 通过）

- [ ] **Step 5: 提交**

```bash
git add src/data/date-utils.ts src/data/date-utils.test.ts
git commit -m "feat: date-utils 加 daysBetween/monthOf（供积分账本与补签用）"
```

---

## Task 2: Dexie v4 schema + RewardRow/RedemptionRow 类型

**Files:**
- Modify: `src/data/db.ts`

**Interfaces:**
- Produces: `db.rewards`、`db.redemptions` 两张表；`RewardRow`、`RedemptionRow` 类型（后续所有任务消费）。
- Consumes: 无。

本仓库 Dexie 层不单测（`checkin.ts`/`dex-service.ts` 均无单测，只测纯逻辑）。本任务靠 `tsc` + 全量单测不回归验证。

- [ ] **Step 1: 加类型 + v4 store**

在 `src/data/db.ts` 中，`MonsterRow` 接口后追加两个接口：

```ts
/** 家长自定义的现实奖励（v4 新增） */
export interface RewardRow {
  id?: number
  title: string
  cost: number
  active: boolean       // 软删
  createdAt: number
}

/** 积分消耗账本：兑换奖励 / 买补签卡（v4 新增） */
export interface RedemptionRow {
  id?: number
  kind: 'reward' | 'repair'
  title: string         // 名称快照
  cost: number
  createdAt: number
  createdDate: string   // 本地 YYYY-MM-DD，供按月计数
  status: 'pending' | 'fulfilled' | 'cancelled'
  fulfilledAt?: number
  repairDate?: string   // kind='repair' 时补的是哪天
}
```

给 class 加两张表字段：

```ts
  monsters!: Table<MonsterRow, string>
  rewards!: Table<RewardRow, number>
  redemptions!: Table<RedemptionRow, number>
```

在 `this.version(3)...` 之后追加 v4：

```ts
    this.version(4).stores({
      // 重复声明完整 schema，便于回滚/排查；新增 rewards / redemptions 两表
      sessions: '++id, date',
      checkins: 'date',
      badges: 'id',
      monsters: 'id',
      rewards: '++id',
      redemptions: '++id, kind, status',
    })
```

- [ ] **Step 2: tsc + 全量单测不回归**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: 退出码 0（无报错）

Run: `node node_modules/vitest/vitest.mjs run`
Expected: 全绿（数量 = 现有 + Task 1 的 6）

- [ ] **Step 3: 提交**

```bash
git add src/data/db.ts
git commit -m "feat: Dexie v4 加 rewards/redemptions 表（积分兑换与补签账本）"
```

---

## Task 3: ledger.ts 纯函数（可用积分 / 补签资格）

**Files:**
- Create: `src/rewards/ledger.ts`
- Test: `src/rewards/ledger.test.ts`

**Interfaces:**
- Consumes: `RedemptionRow`、`CheckinRow`（`src/data/db.ts`）、`daysBetween`/`addDays`（`src/data/date-utils.ts`）。
- Produces: `REPAIR_COST`、`availablePoints`、`monthRepairCount`、`canRepair`、`buildRepairCheckin`（Task 4 service 消费）。

- [ ] **Step 1: 写失败测试**

Create `src/rewards/ledger.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import {
  REPAIR_COST, availablePoints, monthRepairCount, canRepair, buildRepairCheckin,
} from './ledger'
import type { RedemptionRow } from '../data/db'

function red(over: Partial<RedemptionRow>): RedemptionRow {
  return {
    kind: 'reward', title: 'x', cost: 100, createdAt: 0,
    createdDate: '2026-07-10', status: 'pending', ...over,
  }
}

describe('availablePoints', () => {
  it('无消耗时 = 累计', () => {
    expect(availablePoints(500, [])).toBe(500)
  })
  it('扣除 pending + fulfilled，排除 cancelled', () => {
    const reds = [
      red({ cost: 100, status: 'pending' }),
      red({ cost: 200, status: 'fulfilled' }),
      red({ cost: 300, status: 'cancelled' }),
    ]
    expect(availablePoints(500, reds)).toBe(200) // 500 - 100 - 200
  })
  it('不为负', () => {
    expect(availablePoints(50, [red({ cost: 100, status: 'fulfilled' })])).toBe(0)
  })
})

describe('monthRepairCount', () => {
  it('只数当月 kind=repair 且非取消', () => {
    const reds = [
      red({ kind: 'repair', status: 'fulfilled', createdDate: '2026-07-02' }),
      red({ kind: 'repair', status: 'fulfilled', createdDate: '2026-07-20' }),
      red({ kind: 'repair', status: 'fulfilled', createdDate: '2026-06-30' }), // 上月
      red({ kind: 'reward', status: 'fulfilled', createdDate: '2026-07-05' }), // 非补签
    ]
    expect(monthRepairCount(reds, '2026-07')).toBe(2)
  })
})

describe('canRepair', () => {
  const base = { today: '2026-07-03', monthRepairCount: 0, available: 500, cost: REPAIR_COST }
  it('恰好漏 1 天可补', () => {
    expect(canRepair({ ...base, lastCheckinDate: '2026-07-01' })).toEqual({ ok: true })
  })
  it('没断（昨天打过卡）不可补', () => {
    expect(canRepair({ ...base, lastCheckinDate: '2026-07-02' }))
      .toEqual({ ok: false, reason: 'not-broken' })
  })
  it('连漏 2+ 天不可补', () => {
    expect(canRepair({ ...base, lastCheckinDate: '2026-06-30' }))
      .toEqual({ ok: false, reason: 'not-broken' })
  })
  it('从无打卡记录不可补', () => {
    expect(canRepair({ ...base, lastCheckinDate: null }))
      .toEqual({ ok: false, reason: 'not-broken' })
  })
  it('本月已补 2 次不可补', () => {
    expect(canRepair({ ...base, lastCheckinDate: '2026-07-01', monthRepairCount: 2 }))
      .toEqual({ ok: false, reason: 'month-limit' })
  })
  it('可用分不足不可补', () => {
    expect(canRepair({ ...base, lastCheckinDate: '2026-07-01', available: 10 }))
      .toEqual({ ok: false, reason: 'no-points' })
  })
})

describe('buildRepairCheckin', () => {
  it('补插行接续 streak、0 分、totalPoints 沿用', () => {
    const row = buildRepairCheckin({ streak: 5, totalPoints: 800 }, '2026-07-02')
    expect(row).toEqual({ date: '2026-07-02', streak: 6, dailyPoints: 0, totalPoints: 800 })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run src/rewards/ledger.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

Create `src/rewards/ledger.ts`：

```ts
import type { RedemptionRow, CheckinRow } from '../data/db'
import { daysBetween, monthOf } from '../data/date-utils'

/** 补签价（中等价，约 1–2 天打卡分；改这一处即可调价） */
export const REPAIR_COST = 50

/** 可用积分 = 累计赚取 − Σ(未取消消耗)，不为负 */
export function availablePoints(totalEarned: number, redemptions: RedemptionRow[]): number {
  const spent = redemptions
    .filter((r) => r.status !== 'cancelled')
    .reduce((sum, r) => sum + r.cost, 0)
  return Math.max(0, totalEarned - spent)
}

/** 当月（本地 YYYY-MM）已用补签次数 */
export function monthRepairCount(redemptions: RedemptionRow[], monthStr: string): number {
  return redemptions.filter(
    (r) => r.kind === 'repair' && r.status !== 'cancelled' && monthOf(r.createdDate) === monthStr,
  ).length
}

export type RepairReason = 'not-broken' | 'no-points' | 'month-limit'
export interface RepairEligibility { ok: boolean; reason?: RepairReason }

/** 补签资格：只补恰好漏 1 天、每月上限、余额充足；不满足给出首个原因 */
export function canRepair(p: {
  lastCheckinDate: string | null
  today: string
  monthRepairCount: number
  available: number
  cost: number
}): RepairEligibility {
  // 恰好漏 1 天 = 上次打卡在今天的前 2 天（昨天没练）
  if (p.lastCheckinDate === null || daysBetween(p.lastCheckinDate, p.today) !== 2) {
    return { ok: false, reason: 'not-broken' }
  }
  if (p.monthRepairCount >= 2) return { ok: false, reason: 'month-limit' }
  if (p.available < p.cost) return { ok: false, reason: 'no-points' }
  return { ok: true }
}

/** 补插的打卡行：接续 streak、0 分、totalPoints 沿用上一条（累计链不虚涨） */
export function buildRepairCheckin(
  lastReal: { streak: number; totalPoints: number },
  missedDate: string,
): CheckinRow {
  return { date: missedDate, streak: lastReal.streak + 1, dailyPoints: 0, totalPoints: lastReal.totalPoints }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node node_modules/vitest/vitest.mjs run src/rewards/ledger.test.ts`
Expected: PASS（17 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/rewards/ledger.ts src/rewards/ledger.test.ts
git commit -m "feat: 积分账本纯函数（可用积分/补签资格/补插行），TDD"
```

---

## Task 4: rewards-service.ts（薄 Dexie 封装）

**Files:**
- Create: `src/rewards/rewards-service.ts`

**Interfaces:**
- Consumes: `db`、`RewardRow`、`RedemptionRow`、`CheckinRow`（db.ts）；ledger 全部导出；`toDateStr`/`addDays`/`monthOf`（date-utils）；`pushRewards`/`pushRedemptions`/`pushCheckin`（Task 5 加，先按签名调用）。
- Produces：见下方各函数签名，供 Task 7/8/9 的 UI 消费。

薄封装、不单测（沿用 `checkin.ts`/`dex-service.ts`）。逻辑已在 Task 3 测过。用 `tsc` + 全量单测不回归验证。

> 注：本任务引用 Task 5 才创建的 `pushRewards`/`pushRedemptions`（`src/data/api.ts`）。执行顺序上 Task 5 可先做；若先做本任务，先在 api.ts 加空实现桩再于 Task 5 补全。为简化，**先做 Task 5 再做本任务**。

- [ ] **Step 1: 实现 service**

Create `src/rewards/rewards-service.ts`：

```ts
import { db, type RewardRow, type RedemptionRow, type CheckinRow } from '../data/db'
import { availablePoints, monthRepairCount, canRepair, buildRepairCheckin, REPAIR_COST, type RepairEligibility } from './ledger'
import { toDateStr, addDays, monthOf } from '../data/date-utils'
import { pushRewards, pushRedemptions, pushCheckin } from '../data/api'

/** 最新累计积分（来自 checkins 链的最后一条） */
async function latestTotalPoints(): Promise<number> {
  const last = await db.checkins.orderBy('date').last()
  return last ? last.totalPoints : 0
}

/** 上架奖励（active），家长与孩子都看这一份 */
export async function listRewards(): Promise<RewardRow[]> {
  const all = await db.rewards.toArray()
  return all.filter((r) => r.active).sort((a, b) => a.cost - b.cost)
}

export async function addReward(title: string, cost: number): Promise<void> {
  const row: RewardRow = { title, cost, active: true, createdAt: Date.now() }
  const id = await db.rewards.add(row)
  pushRewards([{ ...row, id }])
}

export async function updateReward(id: number, patch: { title: string; cost: number }): Promise<void> {
  await db.rewards.update(id, patch)
  const row = await db.rewards.get(id)
  if (row) pushRewards([row])
}

/** 软删：置 active=false，历史兑换名称快照不受影响 */
export async function deactivateReward(id: number): Promise<void> {
  await db.rewards.update(id, { active: false })
  const row = await db.rewards.get(id)
  if (row) pushRewards([row])
}

/** 可用积分 = 累计 − 未取消消耗 */
export async function getAvailablePoints(): Promise<number> {
  const [total, reds] = await Promise.all([latestTotalPoints(), db.redemptions.toArray()])
  return availablePoints(total, reds)
}

export async function listRedemptions(): Promise<RedemptionRow[]> {
  const all = await db.redemptions.toArray()
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function listPending(): Promise<RedemptionRow[]> {
  return (await listRedemptions()).filter((r) => r.status === 'pending')
}

/** 孩子申请兑换：预扣（记 pending）。余额不足或奖励失效返回 null */
export async function requestRedemption(rewardId: number): Promise<RedemptionRow | null> {
  const reward = await db.rewards.get(rewardId)
  if (!reward || !reward.active) return null
  const available = await getAvailablePoints()
  if (available < reward.cost) return null
  const now = Date.now()
  const row: RedemptionRow = {
    kind: 'reward', title: reward.title, cost: reward.cost,
    createdAt: now, createdDate: toDateStr(new Date(now)), status: 'pending',
  }
  const id = await db.redemptions.add(row)
  const saved = { ...row, id }
  pushRedemptions([saved])
  return saved
}

/** 家长确认已兑现 */
export async function fulfillRedemption(id: number): Promise<void> {
  await db.redemptions.update(id, { status: 'fulfilled', fulfilledAt: Date.now() })
  const row = await db.redemptions.get(id)
  if (row) pushRedemptions([row])
}

/** 家长取消：退回可用积分 */
export async function cancelRedemption(id: number): Promise<void> {
  await db.redemptions.update(id, { status: 'cancelled' })
  const row = await db.redemptions.get(id)
  if (row) pushRedemptions([row])
}

export interface RepairStatus extends RepairEligibility {
  streak: number       // 补签后可保住的连续天数（= 上次真实 streak）
  cost: number
  missedDate: string   // 漏掉的那天（= 昨天）
}

/** 首页补签横幅所需状态 */
export async function getRepairStatus(today: string): Promise<RepairStatus> {
  const last = await db.checkins.orderBy('date').last()
  const [available, reds] = await Promise.all([getAvailablePoints(), db.redemptions.toArray()])
  const elig = canRepair({
    lastCheckinDate: last ? last.date : null,
    today,
    monthRepairCount: monthRepairCount(reds, monthOf(today)),
    available,
    cost: REPAIR_COST,
  })
  return { ...elig, streak: last ? last.streak : 0, cost: REPAIR_COST, missedDate: addDays(today, -1) }
}

/** 执行补签：记消耗（fulfilled）+ 补插打卡行。返回是否成功 */
export async function doRepair(today: string): Promise<boolean> {
  const status = await getRepairStatus(today)
  if (!status.ok) return false
  const last = await db.checkins.orderBy('date').last()
  if (!last) return false
  const now = Date.now()
  const redemption: RedemptionRow = {
    kind: 'repair', title: 'repair', cost: status.cost,
    createdAt: now, createdDate: toDateStr(new Date(now)),
    status: 'fulfilled', fulfilledAt: now, repairDate: status.missedDate,
  }
  const checkinRow: CheckinRow = buildRepairCheckin(last, status.missedDate)
  const id = await db.redemptions.add(redemption)
  await db.checkins.put(checkinRow)
  pushRedemptions([{ ...redemption, id }])
  pushCheckin(checkinRow)
  return true
}
```

- [ ] **Step 2: tsc + 全量单测不回归**（需 Task 5 已完成，api.ts 有 pushRewards/pushRedemptions）

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: 退出码 0

Run: `node node_modules/vitest/vitest.mjs run`
Expected: 全绿不回归

- [ ] **Step 3: 提交**

```bash
git add src/rewards/rewards-service.ts
git commit -m "feat: rewards-service（奖励CRUD/兑换预扣与确认/补签落库），薄Dexie封装"
```

---

## Task 5: 后端双写（server + api.ts）

**Files:**
- Modify: `server/db.ts`
- Modify: `server/index.ts`
- Modify: `src/data/api.ts`

**Interfaces:**
- Produces: `pushRewards(rows)`、`pushRedemptions(rows)`（Task 4 消费）；后端 `/api/rewards`、`/api/redemptions` 路由。
- Consumes: `RewardRow`/`RedemptionRow`（db.ts）。

- [ ] **Step 1: 后端建表 + upsert（server/db.ts）**

在 `server/db.ts` 的 `db.exec(...)` 建表块里，`monsters` 表后追加：

```sql
  CREATE TABLE IF NOT EXISTS rewards (
    id        INTEGER PRIMARY KEY,
    title     TEXT NOT NULL,
    cost      INTEGER NOT NULL,
    active    INTEGER NOT NULL,
    createdAt INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS redemptions (
    id          INTEGER PRIMARY KEY,
    kind        TEXT NOT NULL,
    title       TEXT NOT NULL,
    cost        INTEGER NOT NULL,
    createdAt   INTEGER NOT NULL,
    createdDate TEXT NOT NULL,
    status      TEXT NOT NULL,
    fulfilledAt INTEGER,
    repairDate  TEXT
  );
```

在 `MonsterRow` 接口后追加类型：

```ts
export interface RewardRow {
  id: number
  title: string
  cost: number
  active: number      // SQLite 无 bool，用 0/1
  createdAt: number
}
export interface RedemptionRow {
  id: number
  kind: string
  title: string
  cost: number
  createdAt: number
  createdDate: string
  status: string
  fulfilledAt?: number
  repairDate?: string
}
```

在文件末尾 `allMonsters` 后追加读写函数（rewards/redemptions 用前端自增 id 作主键 upsert，**允许覆盖**——因为状态会变，与 badges/monsters 的 DO NOTHING 不同）：

```ts
/** rewards 按 id upsert（可更新 title/cost/active） */
export function upsertReward(r: RewardRow): void {
  db.prepare(
    `INSERT INTO rewards (id,title,cost,active,createdAt) VALUES (?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, cost=excluded.cost, active=excluded.active`,
  ).run(r.id, r.title, r.cost, r.active ? 1 : 0, r.createdAt)
}
export function allRewards(): RewardRow[] {
  return db.prepare('SELECT id,title,cost,active,createdAt FROM rewards ORDER BY createdAt').all() as unknown as RewardRow[]
}

/** redemptions 按 id upsert（可更新 status/fulfilledAt） */
export function upsertRedemption(r: RedemptionRow): void {
  db.prepare(
    `INSERT INTO redemptions (id,kind,title,cost,createdAt,createdDate,status,fulfilledAt,repairDate)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET status=excluded.status, fulfilledAt=excluded.fulfilledAt`,
  ).run(r.id, r.kind, r.title, r.cost, r.createdAt, r.createdDate, r.status, r.fulfilledAt ?? null, r.repairDate ?? null)
}
export function allRedemptions(): RedemptionRow[] {
  return db.prepare('SELECT * FROM redemptions ORDER BY createdAt').all() as unknown as RedemptionRow[]
}
```

- [ ] **Step 2: 后端路由（server/index.ts）**

在 import 块补 `upsertReward, allRewards, upsertRedemption, allRedemptions`。在 `/api/monsters` 路由后追加：

```ts
    if (url === '/api/rewards' && method === 'GET') return send(res, 200, allRewards())
    if (url === '/api/rewards' && method === 'POST') {
      const body = await readBody(req)
      const rows = Array.isArray(body) ? body : [body]
      for (const r of rows) upsertReward(r as never)
      return send(res, 200, { ok: true })
    }
    if (url === '/api/redemptions' && method === 'GET') return send(res, 200, allRedemptions())
    if (url === '/api/redemptions' && method === 'POST') {
      const body = await readBody(req)
      const rows = Array.isArray(body) ? body : [body]
      for (const r of rows) upsertRedemption(r as never)
      return send(res, 200, { ok: true })
    }
```

- [ ] **Step 3: 前端同步层（src/data/api.ts）**

import 补 `RewardRow, RedemptionRow`。在 `pushMonsters` 后追加：

```ts
export function pushRewards(rows: RewardRow[]): void {
  if (rows.length > 0) void post('/rewards', rows)
}
export function pushRedemptions(rows: RedemptionRow[]): void {
  if (rows.length > 0) void post('/redemptions', rows)
}
```

在 `pushAll` 里把两表纳入回填：

```ts
    const [sessions, checkins, badges, monsters, rewards, redemptions] = await Promise.all([
      db.sessions.toArray(),
      db.checkins.toArray(),
      db.badges.toArray(),
      db.monsters.toArray(),
      db.rewards.toArray(),
      db.redemptions.toArray(),
    ])
```

并在串行回填末尾追加：

```ts
    if (rewards.length > 0) await post('/rewards', rewards)
    if (redemptions.length > 0) await post('/redemptions', redemptions)
```

- [ ] **Step 4: tsc 验证**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: 退出码 0

- [ ] **Step 5: 提交**

```bash
git add server/db.ts server/index.ts src/data/api.ts
git commit -m "feat: 后端双写 rewards/redemptions 两表 + 回填（可更新状态的 upsert）"
```

---

## Task 6: i18n 文案（zh + en）

**Files:**
- Modify: `src/i18n.tsx`

**Interfaces:**
- Produces: 下列 `reward.*` key（Task 7/8/9 UI 消费）。

- [ ] **Step 1: 加 key**

在 `src/i18n.tsx` 的 `ZH` 字典里（`dex.empty` 那组之后的合适处）追加：

```ts
  // 积分兑换 + 补签
  'reward.available': '可用积分',
  'reward.total': '累计积分',
  'reward.homeCard': '🎁 奖励兑换',
  'reward.homeCardHint': '用积分换现实奖励',
  'reward.pageTitle': '🎁 奖励兑换',
  'reward.emptyList': '还没有奖励，让爸妈在设置里添加吧～',
  'reward.cost': '{n} 分',
  'reward.redeem': '兑换',
  'reward.notEnough': '积分不够',
  'reward.requested': '已申请，等爸妈确认',
  'reward.history': '兑换记录',
  'reward.status.pending': '待确认',
  'reward.status.fulfilled': '已兑现',
  'reward.status.cancelled': '已取消',
  'reward.noHistory': '还没有兑换记录',
  // 设置页家长区
  'reward.config': '🎁 奖励设置',
  'reward.configHint': '添加孩子可以用积分兑换的现实奖励',
  'reward.addTitle': '奖励名称（如：看一集动画）',
  'reward.addCost': '所需积分',
  'reward.add': '添加',
  'reward.delete': '删除',
  'reward.pendingTitle': '待确认兑换',
  'reward.noPending': '没有待确认的兑换',
  'reward.fulfill': '✅ 已兑现',
  'reward.cancelBtn': '取消',
  // 补签
  'repair.banner': '😱 昨天漏练了！花 {cost} 分补签，保住 {streak} 天连续',
  'repair.do': '补签',
  'repair.done': '✅ 补签成功，连续天数保住啦！',
  'repair.noPoints': '积分不够补签（需 {cost} 分）',
  'repair.monthLimit': '本月补签次数已用完（每月 2 次）',
```

在 `EN` 字典对应处追加同名 key：

```ts
  // Points redemption + streak repair
  'reward.available': 'Available',
  'reward.total': 'Total earned',
  'reward.homeCard': '🎁 Rewards',
  'reward.homeCardHint': 'Trade points for real rewards',
  'reward.pageTitle': '🎁 Rewards',
  'reward.emptyList': 'No rewards yet — ask a parent to add some in Settings.',
  'reward.cost': '{n} pts',
  'reward.redeem': 'Redeem',
  'reward.notEnough': 'Not enough points',
  'reward.requested': 'Requested — waiting for a parent',
  'reward.history': 'History',
  'reward.status.pending': 'Pending',
  'reward.status.fulfilled': 'Fulfilled',
  'reward.status.cancelled': 'Cancelled',
  'reward.noHistory': 'No redemptions yet',
  'reward.config': '🎁 Reward setup',
  'reward.configHint': 'Add real-world rewards your child can redeem with points',
  'reward.addTitle': 'Reward name (e.g. one cartoon episode)',
  'reward.addCost': 'Cost (points)',
  'reward.add': 'Add',
  'reward.delete': 'Delete',
  'reward.pendingTitle': 'Pending redemptions',
  'reward.noPending': 'No pending redemptions',
  'reward.fulfill': '✅ Fulfilled',
  'reward.cancelBtn': 'Cancel',
  'repair.banner': '😱 Missed yesterday! Spend {cost} pts to keep your {streak}-day streak',
  'repair.do': 'Repair',
  'repair.done': '✅ Streak saved!',
  'repair.noPoints': 'Not enough points to repair (need {cost})',
  'repair.monthLimit': 'No repairs left this month (2/month)',
```

- [ ] **Step 2: tsc 验证 key 无语法错**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: 退出码 0

- [ ] **Step 3: 提交**

```bash
git add src/i18n.tsx
git commit -m "feat: 积分兑换/补签 i18n 中英文案"
```

---

## Task 7: 兑换页 RewardsPage + App 视图接入 + 首页入口卡

**Files:**
- Create: `src/rewards/RewardsPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/HomePage.tsx`

**Interfaces:**
- Consumes: `listRewards`/`getAvailablePoints`/`requestRedemption`/`listRedemptions`（Task 4）；`reward.*` i18n（Task 6）。
- Produces: `RewardsPage` 组件；App `view='rewards'`。

UI 层不单测；用 preview 验证。参考现有 `DexWall.tsx`/`HomePage.tsx` 的 `fq-card`/`fq-btn`/`fq-bar` 样式类。

- [ ] **Step 1: 写 RewardsPage**

Create `src/rewards/RewardsPage.tsx`：

```tsx
import { useEffect, useState } from 'react'
import type { RewardRow, RedemptionRow } from '../data/db'
import { listRewards, getAvailablePoints, requestRedemption, listRedemptions } from './rewards-service'
import { useT } from '../i18n'

export function RewardsPage() {
  const t = useT()
  const [rewards, setRewards] = useState<RewardRow[] | null>(null)
  const [available, setAvailable] = useState(0)
  const [history, setHistory] = useState<RedemptionRow[]>([])

  async function refresh() {
    const [rws, av, hist] = await Promise.all([listRewards(), getAvailablePoints(), listRedemptions()])
    setRewards(rws)
    setAvailable(av)
    setHistory(hist.filter((r) => r.kind === 'reward'))
  }
  useEffect(() => { void refresh() }, [])

  async function onRedeem(r: RewardRow) {
    const ok = await requestRedemption(r.id!)
    if (ok) await refresh()
  }

  if (rewards === null) return <div className="fq-page">{t('home.loading')}</div>

  return (
    <div className="fq-page fq-rise">
      <h2 className="fq-h2">{t('reward.pageTitle')}</h2>

      {/* 可用积分 */}
      <div className="fq-card" style={{ marginTop: 14, textAlign: 'center' }}>
        <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--violet)' }}>{available}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{t('reward.available')}</div>
      </div>

      {/* 奖励列表 */}
      {rewards.length === 0 ? (
        <div className="fq-card" style={{ marginTop: 14, color: 'var(--muted)', fontSize: 13 }}>{t('reward.emptyList')}</div>
      ) : (
        rewards.map((r) => {
          const affordable = available >= r.cost
          return (
            <div key={r.id} className="fq-card" style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{r.title}</div>
                <div style={{ fontSize: 12, color: 'var(--violet)', fontWeight: 700 }}>{t('reward.cost', { n: r.cost })}</div>
              </div>
              <button
                className="fq-btn"
                disabled={!affordable}
                onClick={() => void onRedeem(r)}
                style={{ opacity: affordable ? 1 : 0.5 }}
              >
                {affordable ? t('reward.redeem') : t('reward.notEnough')}
              </button>
            </div>
          )
        })
      )}

      {/* 兑换记录 */}
      <div className="fq-card-title" style={{ marginTop: 22, fontSize: 15 }}>{t('reward.history')}</div>
      {history.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>{t('reward.noHistory')}</div>
      ) : (
        history.map((h) => (
          <div key={h.id} className="fq-card" style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span>{h.title}</span>
            <span style={{ color: 'var(--muted)' }}>{t('reward.cost', { n: h.cost })} · {t(`reward.status.${h.status}`)}</span>
          </div>
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 2: App 接入 view='rewards'**

`src/App.tsx`：import `RewardsPage`；`View` 类型加 `'rewards'`；给 `HomePage` 传 `onOpenRewards`；渲染分支加 `{view === 'rewards' && <RewardsPage />}`。

```tsx
import { RewardsPage } from './rewards/RewardsPage'
// type View 增加 'rewards'
// HomePage 调用处：
<HomePage
  onStart={() => setView('train')}
  onOpenDex={() => { setBadgeTab('dex'); setView('badges') }}
  onOpenRewards={() => setView('rewards')}
/>
// 渲染分支追加：
{view === 'rewards' && <RewardsPage />}
```

- [ ] **Step 3: 首页奖励入口卡（在图鉴卡之后）**

`src/HomePage.tsx`：props 加 `onOpenRewards: () => void`；在图鉴入口卡之后追加：

```tsx
<button
  onClick={onOpenRewards}
  className="fq-card"
  style={{ textAlign: 'left', cursor: 'pointer', border: '1.5px solid var(--coral)', background: 'linear-gradient(135deg, #fff2ec, #fffaf0)', padding: '14px 16px' }}
>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14, fontWeight: 700 }}>
    <span>{t('reward.homeCard')}</span>
    <span style={{ color: 'var(--coral)', fontWeight: 700 }}>{t('reward.homeCardHint')} →</span>
  </div>
</button>
```

- [ ] **Step 4: preview 验证**

Run: `node node_modules/typescript/bin/tsc --noEmit`（Expected: 0）
用 preview_start(focal-quest-dev) → 首页应见"🎁 奖励兑换"卡 → eval 点击进入 → 兑换页渲染可用积分/空列表提示（无奖励时）。检查 `preview_console_logs level=error` 无报错。

- [ ] **Step 5: 提交**

```bash
git add src/rewards/RewardsPage.tsx src/App.tsx src/HomePage.tsx
git commit -m "feat: 兑换页 RewardsPage + 首页入口卡 + App 视图接入"
```

---

## Task 8: 首页——可用积分 + 补签横幅

**Files:**
- Modify: `src/HomePage.tsx`

**Interfaces:**
- Consumes: `getAvailablePoints`、`getRepairStatus`、`doRepair`（Task 4）；`repair.*`/`reward.*` i18n。

- [ ] **Step 1: 打卡卡片加"可用积分"**

`src/HomePage.tsx`：新增 state 读取可用积分与补签状态：

```tsx
import { getAvailablePoints, getRepairStatus, doRepair, type RepairStatus } from './rewards/rewards-service'
// ...
const [available, setAvailable] = useState<number | null>(null)
const [repair, setRepair] = useState<RepairStatus | null>(null)
useEffect(() => {
  const today = toDateStr(new Date())
  void getAvailablePoints().then(setAvailable)
  void getRepairStatus(today).then(setRepair)
}, [])
```

在打卡卡片"累计积分"那一列右侧，加"可用积分"列（累计列文案改用 `reward.total`，避免和可用混淆）：

```tsx
<div style={{ width: 1, height: 42, background: '#ffffff55' }} />
<div>
  <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{available ?? '—'}</div>
  <div style={{ fontSize: 12, opacity: 0.92, marginTop: 6 }}>{t('reward.available')}</div>
</div>
```

- [ ] **Step 2: 补签横幅（打卡卡片下方，仅漏 1 天时出现）**

在打卡卡片之后追加。`repair.ok` 为 true 才显示可补横幅；`reason==='no-points'|'month-limit'` 显示禁用提示；`not-broken` 不显示。

```tsx
{repair?.ok && (
  <div className="fq-card fq-rise" style={{ border: '1.5px solid var(--coral)', background: '#fff4ec' }}>
    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
      {t('repair.banner', { cost: repair.cost, streak: repair.streak })}
    </div>
    <button
      className="fq-cta"
      style={{ width: '100%' }}
      onClick={async () => {
        const ok = await doRepair(toDateStr(new Date()))
        if (ok) { const s = await getHomeStats(toDateStr(new Date())); setStats(s); setRepair(await getRepairStatus(toDateStr(new Date()))); setAvailable(await getAvailablePoints()) }
      }}
    >
      {t('repair.do')}
    </button>
  </div>
)}
{repair && !repair.ok && repair.reason === 'no-points' && (
  <div className="fq-card" style={{ color: 'var(--muted)', fontSize: 13 }}>{t('repair.noPoints', { cost: repair.cost })}</div>
)}
{repair && !repair.ok && repair.reason === 'month-limit' && (
  <div className="fq-card" style={{ color: 'var(--muted)', fontSize: 13 }}>{t('repair.monthLimit')}</div>
)}
```

注：`no-points`/`month-limit` 的禁用提示只在"恰好漏 1 天"时才有意义。`getRepairStatus` 对未断连的情况返回 `reason='not-broken'`，上面三个分支都不显示——符合预期。但 `no-points`/`month-limit` 分支在"没断连"时也不会命中（reason 是 not-broken），故安全。

- [ ] **Step 3: preview 验证补签流程**

`node node_modules/typescript/bin/tsc --noEmit`（Expected: 0）。preview 下用 eval 往 IndexedDB 播种"前天打卡、streak 5、totalPoints 500"的 checkin 行 + reload，首页应出现补签横幅；点补签后 streak 保住、可用积分减少、横幅消失。检查 console 无 error。**验证后清理播种数据。**

- [ ] **Step 4: 提交**

```bash
git add src/HomePage.tsx
git commit -m "feat: 首页可用积分展示 + 漏练补签横幅"
```

---

## Task 9: 设置页家长区——奖励配置 + 待确认兑换

**Files:**
- Create: `src/rewards/RewardConfig.tsx`
- Modify: `src/SettingsPage.tsx`

**Interfaces:**
- Consumes: `listRewards`/`addReward`/`deactivateReward`/`listPending`/`fulfillRedemption`/`cancelRedemption`（Task 4）；`reward.*` i18n。
- Produces: `RewardConfig` 组件（塞进 SettingsPage 一个 section，避免 SettingsPage 继续膨胀）。

- [ ] **Step 1: 写 RewardConfig**

Create `src/rewards/RewardConfig.tsx`：

```tsx
import { useEffect, useState } from 'react'
import type { RewardRow, RedemptionRow } from '../data/db'
import { listRewards, addReward, deactivateReward, listPending, fulfillRedemption, cancelRedemption } from './rewards-service'
import { useT } from '../i18n'

export function RewardConfig() {
  const t = useT()
  const [rewards, setRewards] = useState<RewardRow[]>([])
  const [pending, setPending] = useState<RedemptionRow[]>([])
  const [title, setTitle] = useState('')
  const [cost, setCost] = useState('')

  async function refresh() {
    setRewards(await listRewards())
    setPending(await listPending())
  }
  useEffect(() => { void refresh() }, [])

  async function onAdd() {
    const c = Number(cost)
    if (!title.trim() || !Number.isFinite(c) || c <= 0) return
    await addReward(title.trim(), Math.floor(c))
    setTitle(''); setCost('')
    await refresh()
  }

  return (
    <div className="fq-card" style={{ marginTop: 14, textAlign: 'left' }}>
      <div className="fq-card-title">{t('reward.config')}</div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 12px' }}>{t('reward.configHint')}</p>

      {/* 添加表单 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('reward.addTitle')} style={{ flex: '1 1 160px', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--line)' }} />
        <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="numeric" placeholder={t('reward.addCost')} style={{ width: 96, padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--line)' }} />
        <button className="fq-btn" onClick={() => void onAdd()}>{t('reward.add')}</button>
      </div>

      {/* 现有奖励 */}
      {rewards.map((r) => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 13 }}>
          <span>{r.title} · {t('reward.cost', { n: r.cost })}</span>
          <button className="fq-btn" onClick={async () => { await deactivateReward(r.id!); await refresh() }}>{t('reward.delete')}</button>
        </div>
      ))}

      {/* 待确认兑换 */}
      <div className="fq-card-title" style={{ marginTop: 18 }}>{t('reward.pendingTitle')}</div>
      {pending.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{t('reward.noPending')}</p>
      ) : (
        pending.map((p) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 13, gap: 8 }}>
            <span>{p.title} · {t('reward.cost', { n: p.cost })}</span>
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <button className="fq-btn" onClick={async () => { await fulfillRedemption(p.id!); await refresh() }}>{t('reward.fulfill')}</button>
              <button className="fq-btn" onClick={async () => { await cancelRedemption(p.id!); await refresh() }}>{t('reward.cancelBtn')}</button>
            </span>
          </div>
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 2: 挂进 SettingsPage**

`src/SettingsPage.tsx`：import `RewardConfig`，在设置页合适位置（如皮肤/语言区之后）加 `<RewardConfig />`。

```tsx
import { RewardConfig } from './rewards/RewardConfig'
// JSX 中某个 section 后：
<RewardConfig />
```

- [ ] **Step 3: preview 验证家长流程**

`node node_modules/typescript/bin/tsc --noEmit`（Expected: 0）。preview：设置页添加一个奖励 → 兑换页出现该奖励 → 孩子申请 → 设置页"待确认"出现 → 点已兑现/取消状态与可用积分正确变化。console 无 error。

- [ ] **Step 4: 全量单测 + 提交**

Run: `node node_modules/vitest/vitest.mjs run`（Expected: 全绿）

```bash
git add src/rewards/RewardConfig.tsx src/SettingsPage.tsx
git commit -m "feat: 设置页家长区——奖励配置 + 待确认兑换审批"
```

---

## Self-Review 结论

**Spec 覆盖**：可用积分账本(Task 3)、家长配置(Task 9)、孩子兑换+预扣(Task 4/7)、家长确认(Task 4/9)、兑换记录(Task 7)、补签触发/机制/规则(Task 3/4/8)、两个数显示(Task 8)、Dexie v4(Task 2)、后端双写(Task 5)、i18n(Task 6)、测试策略(Task 1/3 纯函数 TDD，其余 preview/tsc) —— 全部有对应任务。

**类型一致**：`RewardRow`/`RedemptionRow` 在 Global Constraints 定义一次，各任务引用同一签名；ledger 五个导出 (`REPAIR_COST`/`availablePoints`/`monthRepairCount`/`canRepair`/`buildRepairCheckin`) 与 Task 4 调用一致；service 函数名 (`listRewards`/`requestRedemption`/`fulfillRedemption`/`cancelRedemption`/`getRepairStatus`/`doRepair` 等) 在 Task 7/8/9 引用一致。

**执行顺序注意**：Task 4 依赖 Task 5 的 `pushRewards`/`pushRedemptions`——**先做 Task 5 再做 Task 4**（或 Task 4 先加桩）。其余按序。

**非单测层**：Dexie service 与 React UI 沿用本仓库既定模式不写单测（`checkin.ts`/`dex-service.ts`/各 Page 均无单测），改用 tsc + 全量单测不回归 + preview 行为验证；执行者**不要**为此引入 fake-indexeddb 等新测试设施。
