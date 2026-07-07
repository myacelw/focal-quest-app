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
    acuity      REAL    NOT NULL
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
`)

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

/** session 以前端 Dexie 的 id 为主键 upsert，重复推送/回填幂等（DO NOTHING） */
export function upsertSession(r: SessionRow): void {
  db.prepare(
    'INSERT INTO sessions (id,date,startedAtMs,eye,answered,correct,flips,elapsedSec,acuity) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
  ).run(r.id, r.date, r.startedAtMs, r.eye, r.answered, r.correct, r.flips, r.elapsedSec, r.acuity)
}
export function allSessions(): SessionRow[] {
  return db
    .prepare('SELECT id,date,startedAtMs,eye,answered,correct,flips,elapsedSec,acuity FROM sessions ORDER BY id')
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
