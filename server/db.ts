import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// SQLite 文件与本模块同目录（server/focalquest.db，已 gitignore）
const here = dirname(fileURLToPath(import.meta.url))
export const db = new DatabaseSync(join(here, 'focalquest.db'))

// 表结构对齐前端 Dexie（src/data/db.ts），字段一一对应，便于双写同步
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY,
    date        TEXT    NOT NULL,
    startedAtMs INTEGER NOT NULL,
    eye         TEXT    NOT NULL,
    answered    INTEGER NOT NULL,
    correct     INTEGER NOT NULL,
    flips       INTEGER NOT NULL,
    elapsedSec  INTEGER NOT NULL,
    acuity      REAL    NOT NULL,
    avgReactionMs REAL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
  CREATE TABLE IF NOT EXISTS checkins (
    date        TEXT PRIMARY KEY,
    streak      INTEGER NOT NULL,
    dailyPoints INTEGER NOT NULL,
    totalPoints INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS badges (
    id         TEXT PRIMARY KEY,
    unlockedAt INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS monsters (
    id         TEXT PRIMARY KEY,
    capturedAt INTEGER NOT NULL,
    source     TEXT NOT NULL
  );
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
  CREATE TABLE IF NOT EXISTS exams (
    id       INTEGER PRIMARY KEY,
    date     TEXT NOT NULL,
    leftEye  REAL NOT NULL,
    rightEye REAL NOT NULL,
    note     TEXT
  );
`)

// 轻量迁移：给早于本字段的旧库补列（新库 CREATE 已含，此处会报"列已存在"被忽略）
try {
  db.exec('ALTER TABLE sessions ADD COLUMN avgReactionMs REAL DEFAULT 0')
} catch {
  /* 列已存在 */
}

export interface SessionRow {
  id: number
  date: string
  startedAtMs: number
  eye: string
  answered: number
  correct: number
  flips: number
  elapsedSec: number
  acuity: number
  avgReactionMs?: number
}
export interface CheckinRow {
  date: string
  streak: number
  dailyPoints: number
  totalPoints: number
}
export interface BadgeRow {
  id: string
  unlockedAt: number
}
export interface MonsterRow {
  id: string
  capturedAt: number
  source: string
}
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
export interface ExamRow {
  id: number
  date: string
  left: number
  right: number
  note?: string
}

/** session 以前端 Dexie 的 id 为主键 upsert，重复推送/回填幂等（DO NOTHING） */
export function upsertSession(r: SessionRow): void {
  db.prepare(
    'INSERT INTO sessions (id,date,startedAtMs,eye,answered,correct,flips,elapsedSec,acuity,avgReactionMs) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
  ).run(r.id, r.date, r.startedAtMs, r.eye, r.answered, r.correct, r.flips, r.elapsedSec, r.acuity, r.avgReactionMs ?? 0)
}
export function allSessions(): SessionRow[] {
  return db
    .prepare('SELECT id,date,startedAtMs,eye,answered,correct,flips,elapsedSec,acuity,avgReactionMs FROM sessions ORDER BY id')
    .all() as unknown as SessionRow[]
}

/** checkins 以 date 为主键 upsert（重复打卡覆盖为最新值） */
export function upsertCheckin(r: CheckinRow): void {
  db.prepare(
    `INSERT INTO checkins (date,streak,dailyPoints,totalPoints) VALUES (?,?,?,?)
     ON CONFLICT(date) DO UPDATE SET streak=excluded.streak,dailyPoints=excluded.dailyPoints,totalPoints=excluded.totalPoints`,
  ).run(r.date, r.streak, r.dailyPoints, r.totalPoints)
}
export function allCheckins(): CheckinRow[] {
  return db
    .prepare('SELECT date,streak,dailyPoints,totalPoints FROM checkins ORDER BY date')
    .all() as unknown as CheckinRow[]
}

/** badges 首次解锁写入，已存在则保留原解锁时间（不覆盖） */
export function upsertBadge(r: BadgeRow): void {
  db.prepare('INSERT INTO badges (id,unlockedAt) VALUES (?,?) ON CONFLICT(id) DO NOTHING').run(r.id, r.unlockedAt)
}
export function allBadges(): BadgeRow[] {
  return db.prepare('SELECT id,unlockedAt FROM badges ORDER BY unlockedAt').all() as unknown as BadgeRow[]
}

/** monsters 首次捕获写入，已存在则保留原捕获时间（不覆盖） */
export function upsertMonster(r: MonsterRow): void {
  db.prepare('INSERT INTO monsters (id,capturedAt,source) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING').run(r.id, r.capturedAt, r.source)
}
export function allMonsters(): MonsterRow[] {
  return db.prepare('SELECT id,capturedAt,source FROM monsters ORDER BY capturedAt').all() as unknown as MonsterRow[]
}

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
