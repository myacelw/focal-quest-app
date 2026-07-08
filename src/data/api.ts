import { db, type SessionRow, type CheckinRow, type BadgeRow } from './db'

/**
 * 前端 → 本地 Node 后端（server/）的最简同步层。只调相对 /api/*，由 Vite proxy 转发。
 * 双写策略：本地 Dexie 是可靠数据源，这里 best-effort 把数据同步到 SQLite；
 * 后端没启动就静默失败——训练/统计照常走本地，完全不受影响。
 */
async function post(path: string, body: unknown): Promise<void> {
  // 测试环境不发网络请求（避免 vitest 挂在无服务器的 fetch 上）
  if (import.meta.env.MODE === 'test') return
  try {
    await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // 后端未启动/离线：忽略，本地 Dexie 仍是可靠来源
  }
}

export function pushSession(row: SessionRow): void {
  void post('/sessions', row)
}
export function pushCheckin(row: CheckinRow): void {
  void post('/checkins', row)
}
export function pushBadges(rows: BadgeRow[]): void {
  if (rows.length > 0) void post('/badges', rows)
}

/** 启动时把本地全部数据回填到后端（幂等），确保历史数据也进 SQLite */
export async function pushAll(): Promise<void> {
  try {
    const [sessions, checkins, badges] = await Promise.all([
      db.sessions.toArray(),
      db.checkins.toArray(),
      db.badges.toArray(),
    ])
    // 串行回填：避免一次并发几十个请求压后端，页面切换时也只影响当前一个
    for (const s of sessions) await post('/sessions', s)
    for (const c of checkins) await post('/checkins', c)
    if (badges.length > 0) await post('/badges', badges)
  } catch {
    // 忽略
  }
}
