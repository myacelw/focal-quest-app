# 数据备份/恢复 + 验光记录 + 设置红点 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ①设置页导出/导入 JSON 备份（覆盖恢复），防线上 PWA 清缓存丢资产；②录入医院验光结果并在统计页看左右眼趋势；③有待确认兑换时设置导航亮红点。

**Architecture:** 三件独立功能。备份 = 纯函数组装/校验（TDD）+ 薄服务层（Blob 下载/file 读取/Dexie 清空写回）；验光 = Dexie v5 新表 exams + 后端双写 + 设置页录入 + 统计页双线 SVG 图；红点 = App 挂载/切视图时查 `listPending()` 数量。沿用本仓库惯例：只对纯逻辑单测，Dexie/UI 薄层用 tsc + preview 验证。

**Tech Stack:** TypeScript + React + Vite + Dexie(IndexedDB) + Node/node:sqlite 后端双写 + vitest。

## Global Constraints

- 与用户交流、代码注释一律**简体中文**；技术标识符英文。
- 新增 UI 文案必须 **zh + en 双语**（`src/i18n.tsx` 的 `ZH`/`EN` 字典都要加），否则中文界面裸显 key（兜底链 `DICT[lang][key] ?? DICT.zh[key] ?? key`）。
- 日期一律用 `src/data/date-utils.ts` 的本地 `YYYY-MM-DD` 约定。
- 后端双写 best-effort：`src/data/api.ts` 的 `post()` 在 `MODE==='test'` 或 `VITE_BACKEND==='off'` 时静默不发。
- 常驻导航保持 5 项不变。
- 导入语义 = **覆盖恢复**（清空后整体写回）；settings 只导出/写回 `fzp.` 前缀键。
- 视力小数记法，校验 `0 < v ≤ 2.0`。
- 测试命令用 `node node_modules/vitest/vitest.mjs run <file>`、类型检查用 `node node_modules/typescript/bin/tsc --noEmit`（此机器 npx 慢，勿用）。

### 共享类型（所有任务以此为准）

```ts
// src/data/db.ts（Task 1 加）
export interface ExamRow {
  id?: number       // ++id
  date: string      // 本地 YYYY-MM-DD，验光日期
  left: number      // 左眼视力，小数记法
  right: number     // 右眼视力，小数记法
  note?: string     // 备注（如度数、医院名）
}
```

```ts
// src/backup/backup.ts（Task 3 加）
export interface BackupTables {
  sessions: SessionRow[]; checkins: CheckinRow[]; badges: BadgeRow[]
  monsters: MonsterRow[]; rewards: RewardRow[]; redemptions: RedemptionRow[]; exams: ExamRow[]
}
export interface BackupFile {
  app: 'focal-quest'; version: 1; exportedAt: number
  tables: BackupTables; settings: Record<string, string>
}
export function buildBackup(tables: BackupTables, settings: Record<string, string>, exportedAt: number): BackupFile
export function validateBackup(data: unknown): data is BackupFile
export function backupFilename(dateStr: string): string
```

---

## Task 1: Dexie v5 + ExamRow

**Files:**
- Modify: `src/data/db.ts`

**Interfaces:**
- Produces: `ExamRow` 类型、`db.exams` 表（Task 3/4/5/6/7 消费）。

薄层不单测，靠 tsc + 全量单测不回归。

- [ ] **Step 1: 加类型 + v5 store**

在 `src/data/db.ts` 的 `RedemptionRow` 接口后追加：

```ts
/** 线下验光记录（v5 新增），视力为小数记法（0.6/0.8/1.0） */
export interface ExamRow {
  id?: number
  date: string      // 本地 YYYY-MM-DD，验光日期
  left: number      // 左眼视力
  right: number     // 右眼视力
  note?: string     // 备注（如度数、医院名）
}
```

class 加表字段（`redemptions!` 之后）：

```ts
  exams!: Table<ExamRow, number>
```

`this.version(4)...` 之后追加：

```ts
    this.version(5).stores({
      // 重复声明完整 schema，便于回滚/排查；新增 exams 表
      sessions: '++id, date',
      checkins: 'date',
      badges: 'id',
      monsters: 'id',
      rewards: '++id',
      redemptions: '++id, kind, status',
      exams: '++id, date',
    })
```

- [ ] **Step 2: 验证**

Run: `node node_modules/typescript/bin/tsc --noEmit` → Expected: 退出码 0
Run: `node node_modules/vitest/vitest.mjs run` → Expected: 全绿不回归（当前 179）

- [ ] **Step 3: 提交**

```bash
git add src/data/db.ts
git commit -m "feat: Dexie v5 加 exams 表（线下验光记录）"
```

---

## Task 2: 视力校验纯函数 acuity.ts（TDD）

**Files:**
- Create: `src/exams/acuity.ts`
- Test: `src/exams/acuity.test.ts`

**Interfaces:**
- Produces: `isValidAcuity(v: number): boolean`（Task 5 录入校验消费）。

- [ ] **Step 1: 写失败测试**

Create `src/exams/acuity.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { isValidAcuity } from './acuity'

describe('isValidAcuity', () => {
  it('0.1 / 1.0 / 2.0 合法', () => {
    expect(isValidAcuity(0.1)).toBe(true)
    expect(isValidAcuity(1.0)).toBe(true)
    expect(isValidAcuity(2.0)).toBe(true)
  })
  it('0 / 负数 / 超 2.0 / NaN 拒绝', () => {
    expect(isValidAcuity(0)).toBe(false)
    expect(isValidAcuity(-1)).toBe(false)
    expect(isValidAcuity(2.1)).toBe(false)
    expect(isValidAcuity(NaN)).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run src/exams/acuity.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

Create `src/exams/acuity.ts`：

```ts
/** 视力值（小数记法）录入校验：0 < v ≤ 2.0，非有限数拒绝 */
export function isValidAcuity(v: number): boolean {
  return Number.isFinite(v) && v > 0 && v <= 2.0
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node node_modules/vitest/vitest.mjs run src/exams/acuity.test.ts` → Expected: PASS（2 用例）

- [ ] **Step 5: 提交**

```bash
git add src/exams/acuity.ts src/exams/acuity.test.ts
git commit -m "feat: 视力值校验纯函数（小数记法 0<v≤2.0），TDD"
```

---

## Task 3: 备份组装/校验纯函数 backup.ts（TDD）

**Files:**
- Create: `src/backup/backup.ts`
- Test: `src/backup/backup.test.ts`

**Interfaces:**
- Consumes: `SessionRow/CheckinRow/BadgeRow/MonsterRow/RewardRow/RedemptionRow/ExamRow`（db.ts，Task 1 后齐全）。
- Produces: `BackupTables`、`BackupFile`、`buildBackup`、`validateBackup`、`backupFilename`（Task 7 消费）。

- [ ] **Step 1: 写失败测试**

Create `src/backup/backup.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildBackup, validateBackup, backupFilename, type BackupTables } from './backup'

const emptyTables: BackupTables = {
  sessions: [], checkins: [], badges: [], monsters: [], rewards: [], redemptions: [], exams: [],
}

describe('buildBackup / validateBackup', () => {
  it('组装含标识/版本/时间/全部 7 表/设置', () => {
    const f = buildBackup(emptyTables, { 'fzp.lang': 'zh' }, 1234)
    expect(f.app).toBe('focal-quest')
    expect(f.version).toBe(1)
    expect(f.exportedAt).toBe(1234)
    expect(Object.keys(f.tables).sort()).toEqual(
      ['badges', 'checkins', 'exams', 'monsters', 'redemptions', 'rewards', 'sessions'],
    )
    expect(f.settings['fzp.lang']).toBe('zh')
  })
  it('validate 接受合法文件', () => {
    expect(validateBackup(buildBackup(emptyTables, {}, 1))).toBe(true)
  })
  it('validate 拒绝非对象/标识不符/版本不符', () => {
    expect(validateBackup(null)).toBe(false)
    expect(validateBackup('x')).toBe(false)
    expect(validateBackup({ ...buildBackup(emptyTables, {}, 1), app: 'other' })).toBe(false)
    expect(validateBackup({ ...buildBackup(emptyTables, {}, 1), version: 2 })).toBe(false)
  })
  it('validate 拒绝缺表/表非数组/缺 settings', () => {
    const good = buildBackup(emptyTables, {}, 1)
    const missing = JSON.parse(JSON.stringify(good)) as { tables: Record<string, unknown> }
    delete missing.tables.exams
    expect(validateBackup(missing)).toBe(false)
    expect(validateBackup({ ...good, tables: { ...good.tables, badges: 'x' } })).toBe(false)
    expect(validateBackup({ ...good, settings: null })).toBe(false)
  })
  it('roundtrip：JSON 序列化再解析仍合法且数据一致', () => {
    const tables: BackupTables = {
      ...emptyTables,
      checkins: [{ date: '2026-07-10', streak: 3, dailyPoints: 50, totalPoints: 500 }],
      monsters: [{ id: 'space-ufo', capturedAt: 111, source: 'daily' }],
    }
    const f = buildBackup(tables, { 'fzp.cssPxPerMm': '4.2' }, 999)
    const parsed: unknown = JSON.parse(JSON.stringify(f))
    expect(validateBackup(parsed)).toBe(true)
    expect(parsed).toEqual(f)
  })
})

describe('backupFilename', () => {
  it('按日期拼文件名', () => {
    expect(backupFilename('2026-07-10')).toBe('focalquest-backup-2026-07-10.json')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run src/backup/backup.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

Create `src/backup/backup.ts`：

```ts
import type {
  SessionRow, CheckinRow, BadgeRow, MonsterRow, RewardRow, RedemptionRow, ExamRow,
} from '../data/db'

/** 备份覆盖的全部 Dexie 表 */
export interface BackupTables {
  sessions: SessionRow[]
  checkins: CheckinRow[]
  badges: BadgeRow[]
  monsters: MonsterRow[]
  rewards: RewardRow[]
  redemptions: RedemptionRow[]
  exams: ExamRow[]
}

export interface BackupFile {
  app: 'focal-quest'        // 标识，防误导别的 JSON
  version: 1                // 备份格式版本
  exportedAt: number
  tables: BackupTables
  settings: Record<string, string>   // fzp.* localStorage 键
}

const TABLE_NAMES = ['sessions', 'checkins', 'badges', 'monsters', 'rewards', 'redemptions', 'exams'] as const

export function buildBackup(
  tables: BackupTables,
  settings: Record<string, string>,
  exportedAt: number,
): BackupFile {
  return { app: 'focal-quest', version: 1, exportedAt, tables, settings }
}

/** 结构校验：标识/版本/7 表均为数组/settings 为对象。只校验结构不深查行类型。 */
export function validateBackup(data: unknown): data is BackupFile {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  if (d.app !== 'focal-quest' || d.version !== 1) return false
  if (typeof d.tables !== 'object' || d.tables === null) return false
  const t = d.tables as Record<string, unknown>
  for (const name of TABLE_NAMES) {
    if (!Array.isArray(t[name])) return false
  }
  if (typeof d.settings !== 'object' || d.settings === null) return false
  return true
}

export function backupFilename(dateStr: string): string {
  return `focalquest-backup-${dateStr}.json`
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node node_modules/vitest/vitest.mjs run src/backup/backup.test.ts` → Expected: PASS（6 用例）

- [ ] **Step 5: 提交**

```bash
git add src/backup/backup.ts src/backup/backup.test.ts
git commit -m "feat: 备份文件组装/校验纯函数（roundtrip 一致性），TDD"
```

---

## Task 4: 后端 exams 双写（server + api.ts）

**Files:**
- Modify: `server/db.ts`
- Modify: `server/index.ts`
- Modify: `src/data/api.ts`

**Interfaces:**
- Produces: `pushExams(rows: ExamRow[])`（Task 5 消费）；后端 `/api/exams` GET/POST。
- Consumes: `ExamRow`（db.ts）。

注意：SQLite 里 `LEFT`/`RIGHT` 是关键字，**列名用 leftEye/rightEye**，查询时 `AS "left"` 映射回前端字段。

- [ ] **Step 1: 后端建表 + upsert（server/db.ts）**

`db.exec(...)` 建表块里 `redemptions` 表后追加：

```sql
  CREATE TABLE IF NOT EXISTS exams (
    id       INTEGER PRIMARY KEY,
    date     TEXT NOT NULL,
    leftEye  REAL NOT NULL,
    rightEye REAL NOT NULL,
    note     TEXT
  );
```

`RedemptionRow` 接口后追加：

```ts
export interface ExamRow {
  id: number
  date: string
  left: number
  right: number
  note?: string
}
```

文件末尾追加（记录只增删不改，删除不同步——后端是防丢副本非镜像，同 badges 策略用 DO NOTHING）：

```ts
/** exams 首次写入，已存在保留（记录只增删、删除不同步后端） */
export function upsertExam(r: ExamRow): void {
  db.prepare(
    'INSERT INTO exams (id,date,leftEye,rightEye,note) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
  ).run(r.id, r.date, r.left, r.right, r.note ?? null)
}
export function allExams(): ExamRow[] {
  return db.prepare(
    'SELECT id,date,leftEye AS "left",rightEye AS "right",note FROM exams ORDER BY date',
  ).all() as unknown as ExamRow[]
}
```

- [ ] **Step 2: 后端路由（server/index.ts）**

import 块补 `upsertExam, allExams`。`/api/redemptions` 路由后追加：

```ts
    if (url === '/api/exams' && method === 'GET') return send(res, 200, allExams())
    if (url === '/api/exams' && method === 'POST') {
      const body = await readBody(req)
      const rows = Array.isArray(body) ? body : [body]
      for (const r of rows) upsertExam(r as never)
      return send(res, 200, { ok: true })
    }
```

- [ ] **Step 3: 前端同步层（src/data/api.ts）**

import 补 `ExamRow`。`pushRedemptions` 后追加：

```ts
export function pushExams(rows: ExamRow[]): void {
  if (rows.length > 0) void post('/exams', rows)
}
```

`pushAll` 的 `Promise.all` 数组末尾加 `db.exams.toArray()`，解构变量加 `exams`，串行回填末尾追加：

```ts
    if (exams.length > 0) await post('/exams', exams)
```

- [ ] **Step 4: 验证 + 提交**

Run: `node node_modules/typescript/bin/tsc --noEmit` → Expected: 退出码 0

```bash
git add server/db.ts server/index.ts src/data/api.ts
git commit -m "feat: 后端双写 exams 表 + 回填（leftEye/rightEye 避开 SQL 关键字）"
```

---

## Task 5: exams-service + 设置页验光卡 + i18n

**Files:**
- Create: `src/exams/exams-service.ts`
- Create: `src/exams/ExamConfig.tsx`
- Modify: `src/SettingsPage.tsx`
- Modify: `src/i18n.tsx`

**Interfaces:**
- Consumes: `db.exams`/`ExamRow`（Task 1）、`isValidAcuity`（Task 2）、`pushExams`（Task 4）。
- Produces: `listExams(): Promise<ExamRow[]>`（Task 6 统计页消费）、`addExam`、`deleteExam`、`ExamConfig` 组件、`exam.*` i18n key。

- [ ] **Step 1: service（薄封装，不单测）**

Create `src/exams/exams-service.ts`：

```ts
import { db, type ExamRow } from '../data/db'
import { pushExams } from '../data/api'

/** 全部验光记录，按日期升序 */
export async function listExams(): Promise<ExamRow[]> {
  const all = await db.exams.toArray()
  return all.sort((a, b) => (a.date < b.date ? -1 : 1))
}

export async function addExam(exam: Omit<ExamRow, 'id'>): Promise<void> {
  const id = await db.exams.add(exam)
  pushExams([{ ...exam, id }])
}

/** 删除仅本地（后端是防丢副本非镜像，与其他表策略一致） */
export async function deleteExam(id: number): Promise<void> {
  await db.exams.delete(id)
}
```

- [ ] **Step 2: i18n（zh + en 都加）**

`ZH` 字典 `reward.*` 组之后追加：

```ts
  // 验光记录
  'exam.title': '👁 验光记录',
  'exam.hint': '录入医院验光结果（小数记法，如 0.8），统计页可看趋势',
  'exam.left': '左眼',
  'exam.right': '右眼',
  'exam.note': '备注（可选）',
  'exam.add': '添加',
  'exam.delete': '删除',
  'exam.invalid': '视力值应在 0～2.0 之间',
  'exam.deleteConfirm': '删除 {date} 的验光记录？',
  'exam.chartTitle': '👁 视力趋势',
  'exam.chartEmpty': '在「设置 → 验光记录」录入医院验光结果，这里会显示趋势',
```

`EN` 字典对应处追加：

```ts
  // Eye exam records
  'exam.title': '👁 Eye exams',
  'exam.hint': 'Log clinic exam results (decimal, e.g. 0.8); trends show on the Stats page',
  'exam.left': 'Left',
  'exam.right': 'Right',
  'exam.note': 'Note (optional)',
  'exam.add': 'Add',
  'exam.delete': 'Delete',
  'exam.invalid': 'Acuity must be between 0 and 2.0',
  'exam.deleteConfirm': 'Delete the exam record of {date}?',
  'exam.chartTitle': '👁 Vision trend',
  'exam.chartEmpty': 'Log clinic exam results in Settings → Eye exams to see the trend here',
```

- [ ] **Step 3: ExamConfig 组件**

Create `src/exams/ExamConfig.tsx`：

```tsx
import { useEffect, useState } from 'react'
import type { ExamRow } from '../data/db'
import { listExams, addExam, deleteExam } from './exams-service'
import { isValidAcuity } from './acuity'
import { toDateStr } from '../data/date-utils'
import { useT } from '../i18n'

/** 设置页家长区：验光记录增删（只增删不改） */
export function ExamConfig() {
  const t = useT()
  const [exams, setExams] = useState<ExamRow[]>([])
  const [date, setDate] = useState(() => toDateStr(new Date()))
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function refresh() { setExams(await listExams()) }
  useEffect(() => { void refresh() }, [])

  async function onAdd() {
    const l = Number(left)
    const r = Number(right)
    if (!date || !isValidAcuity(l) || !isValidAcuity(r)) { setErr(t('exam.invalid')); return }
    setErr(null)
    await addExam({ date, left: l, right: r, note: note.trim() || undefined })
    setLeft(''); setRight(''); setNote('')
    await refresh()
  }

  return (
    <div className="fq-card" style={{ marginTop: 14, textAlign: 'left' }}>
      <div className="fq-card-title">{t('exam.title')}</div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 12px' }}>{t('exam.hint')}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--line)' }} />
        <input value={left} onChange={(e) => setLeft(e.target.value)} inputMode="decimal" placeholder={t('exam.left')} style={{ width: 76, padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--line)' }} />
        <input value={right} onChange={(e) => setRight(e.target.value)} inputMode="decimal" placeholder={t('exam.right')} style={{ width: 76, padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--line)' }} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('exam.note')} style={{ flex: '1 1 120px', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--line)' }} />
        <button className="fq-btn" onClick={() => void onAdd()}>{t('exam.add')}</button>
      </div>
      {err && <p style={{ fontSize: 12, color: '#e8590c', marginTop: 8 }}>{err}</p>}
      {exams.map((x) => (
        <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 13 }}>
          <span>{x.date} · {t('exam.left')} {x.left.toFixed(1)} / {t('exam.right')} {x.right.toFixed(1)}{x.note ? ` · ${x.note}` : ''}</span>
          <button className="fq-btn" onClick={async () => { if (!window.confirm(t('exam.deleteConfirm', { date: x.date }))) return; await deleteExam(x.id!); await refresh() }}>{t('exam.delete')}</button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: 挂进 SettingsPage**

`src/SettingsPage.tsx`：import 后在 `<RewardConfig />` 之后加一行：

```tsx
import { ExamConfig } from './exams/ExamConfig'
// JSX：<RewardConfig /> 之后
<ExamConfig />
```

- [ ] **Step 5: 验证 + 提交**

Run: `node node_modules/typescript/bin/tsc --noEmit` → Expected: 0
preview（focal-quest-dev）：设置页出现「👁 验光记录」卡；录入 `0.8/1.0` 成功入列表、录入 `2.5` 显示校验错误、删除有确认。`preview_console_logs level=error` 无报错。

```bash
git add src/exams/exams-service.ts src/exams/ExamConfig.tsx src/SettingsPage.tsx src/i18n.tsx
git commit -m "feat: 设置页验光记录录入（小数记法校验/增删/后端双写）+ i18n"
```

---

## Task 6: DualLineChart + 统计页视力趋势卡

**Files:**
- Create: `src/stats/DualLineChart.tsx`
- Modify: `src/stats/StatsPage.tsx`

**Interfaces:**
- Consumes: `listExams`（Task 5）、`exam.chartTitle`/`exam.chartEmpty`/`exam.left`/`exam.right` i18n（Task 5）。
- Produces: `DualLineChart` 组件。

- [ ] **Step 1: DualLineChart（照 LineChart.tsx 的手绘 SVG 模式）**

Create `src/stats/DualLineChart.tsx`：

```tsx
import { useT } from '../i18n'

/** 双线折线图：左右眼视力趋势（a=左眼紫 / b=右眼珊瑚），共用 y 标尺 */
export function DualLineChart({ a, b, labels, legendA, legendB }: {
  a: number[]; b: number[]; labels: string[]; legendA: string; legendB: string
}) {
  const t = useT()
  const W = 320
  const H = 170
  const pad = 28
  if (a.length === 0) return <p style={{ color: 'var(--muted)' }}>{t('chart.noData')}</p>

  const all = [...a, ...b]
  const max = Math.max(...all, 1)
  const min = Math.min(...all, 0)
  const range = max - min || 1
  const n = a.length
  const x = (i: number) => (n === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1))
  const y = (v: number) => H - pad - ((v - min) / range) * (H - 2 * pad)
  const pts = (vs: number[]) => vs.map((v, i) => `${x(i)},${y(v)}`).join(' ')

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('chart.lineLabel')} style={{ display: 'block' }}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#efe7fb" />
      <polyline points={pts(a)} fill="none" stroke="#6c4bf0" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={pts(b)} fill="none" stroke="#ff8a5b" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {a.map((v, i) => <circle key={`a${i}`} cx={x(i)} cy={y(v)} r={3} fill="#fff" stroke="#6c4bf0" strokeWidth={2} />)}
      {b.map((v, i) => <circle key={`b${i}`} cx={x(i)} cy={y(v)} r={3} fill="#fff" stroke="#ff8a5b" strokeWidth={2} />)}
      <text x={pad} y={pad - 10} fontSize={11} fill="#6c4bf0" fontWeight="700">● {legendA}</text>
      <text x={pad + 64} y={pad - 10} fontSize={11} fill="#ff8a5b" fontWeight="700">● {legendB}</text>
      <text x={W - pad} y={pad - 10} fontSize={11} fill="#9a8fc0" textAnchor="end">{max.toFixed(1)}</text>
      <text x={pad} y={H - 6} fontSize={10} fill="#9a8fc0">{labels[0] ?? ''}</text>
      <text x={W - pad} y={H - 6} fontSize={10} fill="#9a8fc0" textAnchor="end">{labels[labels.length - 1] ?? ''}</text>
    </svg>
  )
}
```

- [ ] **Step 2: 统计页加卡片**

`src/stats/StatsPage.tsx`：加 import 与 state，页面 JSX 末尾（现有最后一张卡之后）加视力趋势卡。视力卡**不参与**日/周/月周期切换（验光低频，全量展示）。

```tsx
import { DualLineChart } from './DualLineChart'
import { listExams } from '../exams/exams-service'
import type { ExamRow } from '../data/db'
// 组件内：
const [exams, setExams] = useState<ExamRow[]>([])
useEffect(() => { void listExams().then(setExams) }, [])
// JSX 末尾：
<div className="fq-card" style={{ marginTop: 14 }}>
  <div className="fq-card-title">{t('exam.chartTitle')}</div>
  {exams.length === 0 ? (
    <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>{t('exam.chartEmpty')}</p>
  ) : (
    <DualLineChart
      a={exams.map((e) => e.left)}
      b={exams.map((e) => e.right)}
      labels={exams.map((e) => e.date.slice(5))}
      legendA={t('exam.left')}
      legendB={t('exam.right')}
    />
  )}
</div>
```

- [ ] **Step 3: 验证 + 提交**

Run: `node node_modules/typescript/bin/tsc --noEmit` → Expected: 0
preview：设置页录 2~3 条不同日期记录 → 统计页出现双线图（紫/珊瑚、图例、首尾日期）；无记录时显示引导文案。console 无 error。**验证后清理录入的测试数据。**

```bash
git add src/stats/DualLineChart.tsx src/stats/StatsPage.tsx
git commit -m "feat: 统计页视力趋势双线图（左紫/右珊瑚，全量展示）"
```

---

## Task 7: backup-service + 设置页备份卡 + i18n

**Files:**
- Create: `src/backup/backup-service.ts`
- Create: `src/backup/BackupCard.tsx`
- Modify: `src/SettingsPage.tsx`
- Modify: `src/i18n.tsx`

**Interfaces:**
- Consumes: `buildBackup/validateBackup/backupFilename/BackupFile/BackupTables`（Task 3）、`db`（7 表）、`lsGet/lsSet`（`src/data/storage.ts`）、`toDateStr`。
- Produces: `exportBackup()`、`parseBackupFile(f)`、`restoreBackup(file)`、`lastBackupAt()`、`BackupCard` 组件、`backup.*` i18n key。

- [ ] **Step 1: service（薄封装，不单测）**

Create `src/backup/backup-service.ts`：

```ts
import { db } from '../data/db'
import { buildBackup, validateBackup, backupFilename, type BackupFile, type BackupTables } from './backup'
import { toDateStr } from '../data/date-utils'
import { lsGet, lsSet } from '../data/storage'

/** 收集全部 fzp.* localStorage 键（不硬编码清单，将来加设置自动纳入） */
function collectSettings(): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('fzp.')) out[k] = localStorage.getItem(k) ?? ''
  }
  return out
}

async function readTables(): Promise<BackupTables> {
  const [sessions, checkins, badges, monsters, rewards, redemptions, exams] = await Promise.all([
    db.sessions.toArray(), db.checkins.toArray(), db.badges.toArray(),
    db.monsters.toArray(), db.rewards.toArray(), db.redemptions.toArray(), db.exams.toArray(),
  ])
  return { sessions, checkins, badges, monsters, rewards, redemptions, exams }
}

/** 导出：组装 → Blob 下载 → 记录备份时间（iPad Safari 会存入"文件"App） */
export async function exportBackup(): Promise<void> {
  const file = buildBackup(await readTables(), collectSettings(), Date.now())
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const aEl = document.createElement('a')
  aEl.href = url
  aEl.download = backupFilename(toDateStr(new Date()))
  aEl.click()
  URL.revokeObjectURL(url)
  lsSet('fzp.lastBackupAt', String(Date.now()))
}

/** 解析并校验文件；格式不对返回 null（不动现有数据） */
export async function parseBackupFile(f: File): Promise<BackupFile | null> {
  try {
    const data: unknown = JSON.parse(await f.text())
    return validateBackup(data) ? data : null
  } catch {
    return null
  }
}

/** 覆盖恢复：清空 7 表 → 整体写回 → settings 写回（仅 fzp.* 键，防夹带） */
export async function restoreBackup(file: BackupFile): Promise<void> {
  await db.transaction('rw', [db.sessions, db.checkins, db.badges, db.monsters, db.rewards, db.redemptions, db.exams], async () => {
    await Promise.all([
      db.sessions.clear(), db.checkins.clear(), db.badges.clear(),
      db.monsters.clear(), db.rewards.clear(), db.redemptions.clear(), db.exams.clear(),
    ])
    await db.sessions.bulkPut(file.tables.sessions)
    await db.checkins.bulkPut(file.tables.checkins)
    await db.badges.bulkPut(file.tables.badges)
    await db.monsters.bulkPut(file.tables.monsters)
    await db.rewards.bulkPut(file.tables.rewards)
    await db.redemptions.bulkPut(file.tables.redemptions)
    await db.exams.bulkPut(file.tables.exams)
  })
  for (const [k, v] of Object.entries(file.settings)) {
    if (k.startsWith('fzp.')) lsSet(k, v)
  }
}

/** 上次备份时间戳，未备份为 null */
export function lastBackupAt(): number | null {
  const v = lsGet('fzp.lastBackupAt')
  return v ? Number(v) : null
}
```

- [ ] **Step 2: i18n（zh + en 都加）**

`ZH` 字典 `exam.*` 组之后追加：

```ts
  // 数据备份
  'backup.title': '📦 数据备份',
  'backup.hint': '定期导出备份文件（存"文件"或传电脑），防清缓存/换设备丢失训练数据',
  'backup.export': '导出备份',
  'backup.import': '导入恢复',
  'backup.last': '上次备份：{when}',
  'backup.never': '⚠️ 从未备份',
  'backup.overdue': '⚠️ 上次备份：{when}（建议重新备份）',
  'backup.confirm': '将覆盖当前全部数据，恢复到备份时刻（{date}）。确定继续？',
  'backup.done': '✅ 恢复成功。若更换了设备，请到设置里重新完成屏幕标定。',
  'backup.badFile': '❌ 备份文件格式不对，未做任何改动。',
```

`EN` 字典对应处追加：

```ts
  // Data backup
  'backup.title': '📦 Data backup',
  'backup.hint': 'Export a backup file regularly (save to Files or your computer) so clearing cache or switching devices never loses training data',
  'backup.export': 'Export backup',
  'backup.import': 'Import & restore',
  'backup.last': 'Last backup: {when}',
  'backup.never': '⚠️ Never backed up',
  'backup.overdue': '⚠️ Last backup: {when} (backup recommended)',
  'backup.confirm': 'This will OVERWRITE all current data and restore to the backup taken on {date}. Continue?',
  'backup.done': '✅ Restored. If you switched devices, please redo screen calibration in Settings.',
  'backup.badFile': '❌ Invalid backup file. Nothing was changed.',
```

- [ ] **Step 3: BackupCard 组件**

Create `src/backup/BackupCard.tsx`：

```tsx
import { useRef, useState } from 'react'
import { exportBackup, parseBackupFile, restoreBackup, lastBackupAt } from './backup-service'
import { toDateStr } from '../data/date-utils'
import { useT } from '../i18n'

const OVERDUE_MS = 30 * 24 * 3600 * 1000   // 超 30 天提示

/** 设置页：数据备份卡（导出 / 导入恢复 / 上次备份超期提醒） */
export function BackupCard() {
  const t = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const [last, setLast] = useState<number | null>(() => lastBackupAt())
  const [msg, setMsg] = useState<string | null>(null)

  const overdue = last === null || Date.now() - last > OVERDUE_MS
  const lastText = last === null
    ? t('backup.never')
    : overdue
      ? t('backup.overdue', { when: toDateStr(new Date(last)) })
      : t('backup.last', { when: toDateStr(new Date(last)) })

  async function onImport(f: File) {
    const file = await parseBackupFile(f)
    if (!file) { setMsg(t('backup.badFile')); return }
    if (!window.confirm(t('backup.confirm', { date: toDateStr(new Date(file.exportedAt)) }))) return
    await restoreBackup(file)
    window.alert(t('backup.done'))
    window.location.reload()
  }

  return (
    <div className="fq-card" style={{ marginTop: 14, textAlign: 'left' }}>
      <div className="fq-card-title">{t('backup.title')}</div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 10px' }}>{t('backup.hint')}</p>
      <div style={{ fontSize: 13, fontWeight: 700, color: overdue ? '#e8590c' : 'var(--muted)', marginBottom: 10 }}>{lastText}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="fq-btn" onClick={async () => { await exportBackup(); setLast(lastBackupAt()) }}>{t('backup.export')}</button>
        <button className="fq-btn" onClick={() => fileRef.current?.click()}>{t('backup.import')}</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImport(f); e.target.value = '' }}
        />
      </div>
      {msg && <p style={{ fontSize: 12, color: '#e8590c', marginTop: 8 }}>{msg}</p>}
    </div>
  )
}
```

- [ ] **Step 4: 挂进 SettingsPage**

`src/SettingsPage.tsx`：import 后在 `<ExamConfig />` 之后加：

```tsx
import { BackupCard } from './backup/BackupCard'
// JSX：<ExamConfig /> 之后
<BackupCard />
```

- [ ] **Step 5: 验证 + 提交**

Run: `node node_modules/typescript/bin/tsc --noEmit` → Expected: 0
Run: `node node_modules/vitest/vitest.mjs run` → Expected: 全绿
preview 验证闭环：①设置页出现备份卡（初始"⚠️ 从未备份"橙色）②点导出触发下载、上次备份变今天 ③用 eval 改一条数据 → 导入刚导出的文件 → confirm → reload 后数据回到备份时刻 ④导入一个非法 JSON（eval 构造 File）显示"格式不对"且数据未动。console 无 error。

```bash
git add src/backup/backup-service.ts src/backup/BackupCard.tsx src/SettingsPage.tsx src/i18n.tsx
git commit -m "feat: 设置页数据备份卡（导出JSON/覆盖恢复/超期提醒）+ i18n"
```

---

## Task 8: 设置导航红点 + 待确认计数

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/rewards/RewardConfig.tsx`

**Interfaces:**
- Consumes: `listPending()`（`src/rewards/rewards-service.ts`，返回 `Promise<RedemptionRow[]>`）。

- [ ] **Step 1: App 导航红点**

`src/App.tsx`：import `listPending`；组件内加 state 并在 `view` 变化时刷新（挂载含首帧）：

```tsx
import { listPending } from './rewards/rewards-service'
// App() 内：
const [pendingCount, setPendingCount] = useState(0)
useEffect(() => { void listPending().then((p) => setPendingCount(p.length)) }, [view])
```

导航按钮的 icon span 改为带红点的相对定位版本（注意保留现有 `onClick` 里的 `setBadgeTab('badges')` 重置逻辑）：

```tsx
<button key={n.key} className={view === n.key ? 'on' : ''} onClick={() => { setBadgeTab('badges'); setView(n.key) }}>
  <span aria-hidden style={{ position: 'relative' }}>
    {n.icon}
    {n.key === 'settings' && pendingCount > 0 && (
      <span style={{ position: 'absolute', top: -2, right: -6, width: 8, height: 8, borderRadius: '50%', background: '#ff4d4f' }} />
    )}
  </span>
  {t(`nav.${n.key}`)}
</button>
```

- [ ] **Step 2: 待确认区标题带数字**

`src/rewards/RewardConfig.tsx` 的待确认标题行改为（直接拼数字，不新增 i18n key）：

```tsx
<div className="fq-card-title" style={{ marginTop: 18 }}>
  {t('reward.pendingTitle')}{pending.length > 0 ? ` (${pending.length})` : ''}
</div>
```

- [ ] **Step 3: 验证 + 提交**

Run: `node node_modules/typescript/bin/tsc --noEmit` → Expected: 0
Run: `node node_modules/vitest/vitest.mjs run` → Expected: 全绿
preview：eval 往 rewards/redemptions 播种一条 pending → 切视图后导航 ⚙️ 出现红点、设置页标题显示「待确认兑换 (1)」→ 家长点已兑现 → 切视图红点消失。**验证后清理播种数据。**

```bash
git add src/App.tsx src/rewards/RewardConfig.tsx
git commit -m "feat: 设置导航待确认兑换红点 + 待确认区计数"
```

---

## Self-Review 结论

**Spec 覆盖**：备份文件格式/导出/覆盖导入/校验失败不动数据/超期提醒/fzp.* 前缀过滤（Task 3/7）、Dexie v5 exams（Task 1）、视力校验（Task 2）、后端双写含 SQL 关键字规避（Task 4）、录入 UI（Task 5）、双线趋势图不参与周期切换（Task 6）、红点+计数（Task 8）、i18n 双语（Task 5/7）、备份含 exams 表（Task 3 类型即含）——全覆盖。

**类型一致**：`ExamRow`（date/left/right/note）在 Task 1 定义、Task 4 后端映射（leftEye/rightEye 列 AS 回 left/right）、Task 5/6 消费一致；`BackupFile/BackupTables` Task 3 定义、Task 7 消费一致；`listPending` 沿用 rewards-service 现有导出。

**执行顺序**：严格按 Task 1→8（Task 3 依赖 Task 1 的 ExamRow；Task 5 依赖 2/4；Task 6 依赖 5；Task 7 依赖 1/3）。

**非单测层**：Blob 下载/file 读取/Dexie 清空写回/红点/图表沿用惯例不写单测，preview 行为验证；执行者不要引入 fake-indexeddb 等新测试设施。
