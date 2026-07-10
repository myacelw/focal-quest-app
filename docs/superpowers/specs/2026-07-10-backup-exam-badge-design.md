# 数据备份/恢复 + 验光记录 + 设置红点 · 设计文档

日期：2026-07-10
状态：已获用户批准（3 个关键决策经确认：覆盖恢复 / 视力小数记法 / 备份超期提醒）

## 1. 背景与目标

三件独立小功能打包一个迭代：

1. **数据备份/恢复**（最优先）：线上 PWA 是 `VITE_BACKEND=off`，iPad 上的 streak/积分/图鉴/兑换记录只存在 Safari IndexedDB 里——清缓存/换设备/iOS 存储回收即全部归零，激励体系被清零一次孩子的信任就毁了。本机 SQLite 双写只在开发期笔记本有效，保护不了线上使用。
2. **线下验光记录**：录入医院验光结果并在统计页看趋势，是"训练到底有没有效"唯一的数据闭环，越早开始记越好。
3. **设置导航红点**：家长不主动点进设置就看不到孩子的待确认兑换申请，补上这个刚上线功能的体验短板。

## 2. 关键决策（用户已确认）

1. **导入语义：覆盖恢复**——导入前确认 → 清空现有数据 → 整体恢复到备份时刻。语义可预测，无合并冲突，适合单设备使用。
2. **视力值格式：小数记法**（0.6 / 0.8 / 1.0），与 app 内"等效视力级别"标注一致。
3. **备份提醒：设置页显示上次备份时间**，超 30 天或从未备份时橙色高亮提示。

## 3. 功能一：数据备份/恢复

### 3.1 备份文件格式

单个 JSON 文件：

```ts
interface BackupFile {
  app: 'focal-quest'        // 标识，防误导别的 JSON
  version: 1                // 备份格式版本，将来结构变更时做迁移
  exportedAt: number        // 导出时间戳
  tables: {
    sessions: SessionRow[]
    checkins: CheckinRow[]
    badges: BadgeRow[]
    monsters: MonsterRow[]
    rewards: RewardRow[]
    redemptions: RedemptionRow[]
    exams: ExamRow[]        // 功能二新增的表也纳入
  }
  settings: Record<string, string>   // 全部 8 个 fzp.* localStorage 键（见 3.5）
}
```

### 3.2 导出

- 设置页「📦 数据备份」卡片点「导出备份」→ 读 7 张 Dexie 表 + localStorage → 组装 BackupFile → `Blob` + `URL.createObjectURL` + `<a download>` 触发下载。
- 文件名：`focalquest-backup-YYYY-MM-DD.json`（本地日期）。
- iPad Safari 下载会进"文件"App，可再 AirDrop/微信传到电脑留存。
- 导出成功后写 `fzp.lastBackupAt = String(Date.now())`。

### 3.3 导入（覆盖恢复）

流程：`<input type="file" accept=".json,application/json">` 选文件 → 读文本 → `JSON.parse` → **结构校验** → `window.confirm`（文案说明"将覆盖当前全部数据，恢复到备份时刻 X"）→ 执行恢复 → 提示成功 → `location.reload()`。

- **结构校验**（`validateBackup`）：`app === 'focal-quest'`、`version === 1`、`tables` 存在且 7 个键均为数组。校验失败给明确错误提示（i18n），**完全不动现有数据**。
- **执行恢复**：7 张表逐一 `clear()` 后 `bulkPut(rows)`；settings 逐键写回 localStorage。
- 恢复**不更新** `fzp.lastBackupAt`（导入不算备份），但备份文件里若含 lastBackupAt 键则随 settings 一起写回。
- 跨设备恢复注意：`fzp.cssPxPerMm` 是屏幕标定值，同一台设备恢复可直接用；**换了不同屏幕的设备应重新标定**——恢复成功提示里注明这一句。

### 3.4 超期提醒

- 卡片显示「上次备份：N 天前」（`fzp.lastBackupAt` 换算）；从未备份显示「从未备份」。
- 超 30 天或从未备份：该行文字用橙色（`#e8590c` 级别的警示色）并加 ⚠️ 前缀。

### 3.5 备份的 settings 键（当前全部 8 个 + lastBackupAt）

`fzp.cssPxPerMm`（屏幕标定）、`fzp.optotypeSizeMm`、`fzp.durationSec`、`fzp.flipperD`、`fzp.flipMs`、`fzp.skinId`、`fzp.lang`、`fzp.onboarded`、`fzp.lastBackupAt`。
实现上不硬编码清单：**导出时遍历 localStorage 所有 `fzp.` 前缀键**，将来加设置自动纳入；导入时只写回 `fzp.` 前缀键（防备份文件夹带无关键）。

### 3.6 代码结构

- `src/backup/backup.ts`（纯函数，TDD）：
  - `buildBackup(tables, settings, exportedAt): BackupFile`
  - `validateBackup(data: unknown): data is BackupFile`（结构校验）
  - `backupFilename(dateStr): string`
- `src/backup/backup-service.ts`（薄封装，不单测）：读全表/localStorage、触发下载、读文件、清空写回、reload。
- 设置页新增「📦 数据备份」卡片（导出按钮 + 导入 file input + 上次备份行）。
- 零后端改动。

## 4. 功能二：线下验光记录

### 4.1 数据模型（Dexie v5 + 后端双写）

```ts
interface ExamRow {
  id?: number       // ++id
  date: string      // 本地 YYYY-MM-DD，验光日期
  left: number      // 左眼视力，小数记法
  right: number     // 右眼视力，小数记法
  note?: string     // 备注（如记录度数、医院名）
}
// db.version(5).stores({ ...完整重复声明, exams: '++id, date' })
```

- 录入校验（纯函数 `isValidAcuity(v)`）：`0 < v && v <= 2.0`。
- 后端 SQLite 照 badges/monsters 模式加 `exams` 表（前端自增 id 作主键、`ON CONFLICT(id) DO NOTHING`——记录只增删不改，删除不同步后端，后端是防丢副本非镜像，与现有表策略一致）+ `pushExams` + `pushAll` 回填。

### 4.2 录入 UI（设置页家长区）

「👁 验光记录」卡片：日期（`<input type="date">` 默认今天）+ 左眼 + 右眼（数字输入，step 0.1）+ 备注（可选文本）+ 添加按钮；下方历史列表（日期 · 左 x.x / 右 x.x · 备注），每行可删（`window.confirm` 确认）。

### 4.3 趋势图（统计页）

- 统计页新卡片「👁 视力趋势」，无记录时显示引导文案（"在设置里录入医院验光结果"）。
- 新组件 `src/stats/DualLineChart.tsx`：照现有 `LineChart.tsx` 的手绘 SVG 模式，画两组值——左眼紫 `#6c4bf0`、右眼珊瑚 `#ff8a5b`，带图例（👁 左 / 右），x 轴首尾标日期，按 date 升序。两线共用 y 标尺（min/max 取两组并集）。
- 视力趋势卡不参与日/周/月周期切换（验光是低频事件，全量展示）。

## 5. 功能三：设置导航红点

- `App.tsx`：新增 state `pendingCount`；挂载时与**每次 `view` 变化时**调 `listPending()` 刷新（孩子兑换后切视图，家长看导航即有红点；不做事件总线）。
- 导航「⚙️ 设置」按钮 icon 右上角：`pendingCount > 0` 时渲染红色小圆点（8px，绝对定位，纯 CSS）。
- 设置页内「待确认兑换」区标题带数字：「待确认兑换 (2)」（复用现有 `reward.pendingTitle`，i18n 加带参版本或直接拼 `(n)`——实现取直接拼数字，不新增 key）。

## 6. i18n（zh + en 全覆盖）

新增 key（两个字典均加，防中文裸显 key）：备份卡标题/导出/导入/上次备份/从未备份/超期提示/导入确认文案/导入成功（含换设备重标定提示）/格式错误提示；验光卡标题/字段占位/添加/删除确认/统计页卡标题/空态引导。具体 key 命名 `backup.*` / `exam.*`，实现时对齐现有命名风格。

## 7. 测试策略

- **TDD**（纯函数）：
  - `backup.ts`：`buildBackup` 含全部表与 settings；`validateBackup` 接受合法文件、拒绝（非对象/app 不符/version 不符/tables 缺表/表非数组）；导出→导入往返数据一致（roundtrip）。
  - `isValidAcuity`：边界 0（拒）/ 0.1（收）/ 2.0（收）/ 2.1（拒）/ NaN（拒）。
- **不单测**（薄层惯例）：Blob 下载、file 读取、Dexie clear+bulkPut、红点 UI、DualLineChart——preview 行为验证 + tsc + 全量单测不回归。
- Dexie v5 迁移可打开旧库。

## 8. 明确不做（本版边界）

自动定时备份、云备份、备份加密、多备份版本管理、合并导入、验光记录编辑（只增删）、红点的实时事件推送（view 切换刷新足够）、视力趋势的周期切换。

## 9. 风险与开放点

- **iPad Safari 下载体验**：`<a download>` 在 iOS Safari 会弹下载确认进"文件"，体验可接受；若实测不佳可换 Web Share API（`navigator.share({files})`）作为增强，本版不做。
- **备份文件被手改坏**：validateBackup 只做结构校验不做逐行类型深校验；坏行导入后果由覆盖语义兜底（再导入一份好的即可恢复）。
- **恢复后皮肤/勋章状态**：全部派生自表数据，恢复即一致，无需额外处理。
