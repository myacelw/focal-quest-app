# 积分兑换现实奖励 + 补签卡 · 设计文档

日期：2026-07-10
状态：已获用户批准（4 个关键决策经确认，设计全文呈现无异议）

## 1. 背景与目标

坚持引擎里积分只累计、无消耗出口；连续天数（streak）有经典死穴——断一天即归零，孩子易挫败弃坑。本功能给积分开两个消耗口：
- **兑换现实奖励**：家长自定义奖励（看动画/去游乐场等），孩子用积分兑换，打通"虚拟积分 → 现实激励"。
- **补签卡**：花积分补回漏练的一天，保护 streak 不归零。

两者共用同一套"可用积分账本"，互相独立又同源。

## 2. 关键决策（用户已确认）

1. **兑换权限**：孩子发起 · 家长确认（孩子点兑换生成待确认记录，家长在设置页点"已兑现"才最终完成）。
2. **补签机制**：事后补签 · 宽限窗口（漏一天后次日一键补，非预购冻结）。
3. **积分显示**：两个数——可用积分（能花）+ 累计积分（皮肤解锁依赖、不减）。
4. **补签成本/上限**：中等价（约 1–2 天打卡分）· 每月上限 2 次。

## 3. 地基：积分账本

现有 `totalPoints`（累计赚取值，单调不减，皮肤/彩蛋/勋章依赖）**完全不动**。新增消耗账本：

> **可用积分 = 累计赚取 − Σ(未取消的消耗 cost)**

- 消耗来自：奖励兑换、补签卡购买。
- 皮肤解锁、"再练 N 分解锁"提示继续读"累计赚取"，故花光可用积分不会退锁。
- 首页打卡卡片显示两个数：**可用积分**（能花的）+ **累计积分**（皮肤进度）。

## 4. 兑换现实奖励（孩子发起 · 家长确认）

### 4.1 家长配置（设置页「🎁 奖励设置」区）
增删奖励，每条 = 名称 + 所需积分。例：「看一集动画 100 分」「周末游乐场 300 分」。删除用软删（`active=false`）以免影响历史兑换记录的名称快照。

### 4.2 孩子兑换（首页「🎁 奖励兑换」卡片 → 兑换页）
- 展示可用积分 + 上架奖励列表。点某奖励 → 生成一条 **pending** 兑换记录，**当即从可用积分扣住**（预扣，防止把同一批分重复兑换多个）。
- 分数不足 / 奖励已下架 → 按钮禁用。
- 页面下方为本人兑换记录（pending / fulfilled / cancelled）。

### 4.3 家长确认（设置页「待确认兑换」列表）
- 「✅ 已兑现」→ 记录转 fulfilled（分数正式花掉，可用不变）。
- 「取消」→ 记录转 cancelled（退回可用积分）。
- 真钱/真力气发生在家长这一步，符合"履约"定位。

### 4.4 扣分时机（明确）
预扣模型：申请即扣（记录 status=pending 已计入消耗），确认不再动可用，取消则退款。可用积分任何时刻都反映真实可花余额，孩子无法超额兑换。

## 5. 补签卡（事后补签 · 宽限窗口）

### 5.1 触发
漏练一天后、次日打开 App，首页弹醒目横幅：「😱 昨天漏练了！花 N 分补签，保住你的 X 天连续」+ 一键补签按钮。

### 5.2 机制
补签 = 两步原子操作：
1. 记一笔消耗（`redemptions` 行，`kind='repair'`，`cost=补签价`，`status='fulfilled'`，`repairDate=漏掉那天`）。
2. 给漏掉那天**补插一条 checkin 行**：`{ date:漏掉日, streak=上次真实打卡.streak+1, dailyPoints:0, totalPoints=上次.totalPoints }`——让 streak 链条重新接上，且累计分不虚涨。

补签后 `currentStreak` 恢复；当天正常打卡时 `nextStreak` 从补插行接续继续 +1。

### 5.3 规则（关键边界）
- **只补恰好漏 1 天**：上次打卡在今天的前 2 天（即昨天漏了）。判定 `daysBetween(lastCheckin.date, today) === 2`。连漏 2 天及以上不给补，streak 照常归零。
- **每月最多 2 次**：从账本按当月 `kind='repair'` 计数派生，无额外状态。"当月"按本地日历月（`repairDate`/`createdAt` 的本地 YYYY-MM，与 date-utils 同套约定）。
- **成本**：中等价，实现时取"约 1–2 天打卡均分"的固定常量（`REPAIR_COST`，改一处可调）。
- 可用分不足 / 本月已补 2 次 → 横幅显示禁用态 + 原因文案。
- 补签自助即时生效，**不需要家长确认**（花的是孩子自赚的虚拟分、无现实成本，同买皮肤逻辑）。

## 6. 数据模型（Dexie v4 + 后端双写）

### 6.1 前端 IndexedDB（Dexie v4）
```ts
interface RewardRow {
  id?: number          // ++id
  title: string
  cost: number
  active: boolean      // 软删
  createdAt: number
}
interface RedemptionRow {
  id?: number          // ++id
  kind: 'reward' | 'repair'
  title: string        // 名称快照（奖励改名/下架后历史仍可读）
  cost: number
  createdAt: number
  status: 'pending' | 'fulfilled' | 'cancelled'
  fulfilledAt?: number
  repairDate?: string  // kind='repair' 时记补的是哪天
}
// db.version(4).stores({ rewards: '++id', redemptions: '++id, kind, status' })
```
- 可用积分 = `totalPoints − Σ(redemptions.cost where status !== 'cancelled')`。
- 补签补插的 checkin 行落在现有 `checkins` 表，`totalPoints` 沿用上一条，保证累计链纯净、皮肤解锁不虚涨。

### 6.2 后端 SQLite
照 badges/monsters 模式加 `rewards`、`redemptions` 两表，双写 + 启动回填幂等；后端没开不影响离线（复用现有降级逻辑）。redemptions 的 `id` 用前端自增 id 作主键 upsert。

## 7. 代码结构

- `src/rewards/ledger.ts`（纯函数，TDD）：
  - `availablePoints(totalEarned, redemptions)` — 可用积分。
  - `canRepair({ lastCheckinDate, today, monthRepairCount, available, cost })` — 补签资格（返回可否 + 原因枚举）。
  - `repairedStreak(lastRealStreak)` / 补插行的派生字段。
- `src/rewards/rewards-service.ts`（副作用层）：rewards CRUD、redemption 申请/确认/取消、补签落库（消耗 + 补插 checkin）、可用积分查询、后端双写调用。
- `src/rewards/RewardsPage.tsx`：孩子兑换页。App 加 `view='rewards'`，从首页卡片进入，**不进常驻导航**（沿用标定/语音那种非导航视图，导航保持 5 项）。
- 设置页新增「奖励设置 + 待确认兑换」区（家长区）。
- 首页：打卡卡片加"可用积分"、新增「🎁 奖励兑换」入口卡片、漏练时的补签横幅。
- i18n：新增 zh/en 全部文案。

## 8. 测试策略（TDD）

- `ledger.availablePoints`：排除 cancelled、计入 pending+fulfilled；结果不为负。
- `ledger.canRepair`：恰好漏 1 天可补、连漏 2+ 不可、本月已 2 次不可、余额不足不可（各返回对应原因）。
- 补签落库：streak 接续正确、次日打卡继续 +1、`totalPoints` 不虚涨、当月计数 +1。
- redemption 状态流转：申请预扣可用、确认后可用不变、取消退款。
- rewards CRUD：软删后不在孩子列表出现、历史兑换名称快照仍可读。
- Dexie v4 迁移可打开旧库。
- i18n 新增 key zh/en 完整。

## 9. 明确不做（第一版边界）

- 家长 PIN / 密码锁（信任家庭内操作）。
- 兑换分类 / 图标 / 奖励到期时间。
- 补签卡预购库存（只做事后补签）。
- 积分消耗历史图表。

## 10. 风险与开放点

- **补签窗口偏严**：只补 1 天可能让"周末连漏两天"无法挽救；先按严格版上线，观察真机反馈再放宽（改 `daysBetween` 判定一处）。
- **预扣 vs 确认扣**：选了预扣，若家长长期不确认，分数一直被占；可在兑换记录页显示"待家长确认"提示缓解，必要时孩子可撤回 pending（本版暂不做撤回，列为潜在增强）。
- **补签价与月上限**是留存旋钮，均为常量，按真机反馈调。
