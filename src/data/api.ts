import {
  db, type SessionRow, type CheckinRow, type BadgeRow, type MonsterRow,
  type RewardRow, type RedemptionRow, type ExamRow,
} from './db'
import { recordUuid, toPayload, clampUpdatedAt, TOMBSTONE, type SyncKind } from '../sync/sync-keys'
import { syncFieldsFor } from '../sync/migrate-fields'
import { kickSync } from '../sync/kick'

/**
 * 写入点 → outbox（云同步的入口）。设计见 spec §6.2。
 *
 * 架构红利：下面 7 个 pushXxx 早已在所有写入点被调用（checkin.ts / rewards-service.ts /
 * badge-service.ts / dex-service.ts / exams-service.ts），所以本次**只换实现、签名一字不动**，
 * 业务代码零改动——从"POST 本机 Node 后端"改成"写本地 outbox + 唤一下同步引擎"。
 *
 * 本地 IndexedDB 永远是唯一可靠源：入队失败、没登录、后端挂了，训练/打卡/统计全照常。
 */
// 纯静态部署且没有 /api 后端时（GitHub Pages 热备链）构建时置 VITE_BACKEND=off，
// 于是不唤醒引擎、也不发请求；Cloudflare Pages 与本机 dev 不设此值 → 默认开。
const SYNC_ENABLED = import.meta.env.VITE_BACKEND !== 'off'
/** 单测环境不唤醒引擎（不起定时器、不发 fetch）；outbox 入队照常，否则本层逻辑无法测 */
const TEST_MODE = import.meta.env.MODE === 'test'

type AnyRow = Record<string, unknown>

const TABLE_OF: Record<SyncKind, string> = {
  session: 'sessions',
  checkin: 'checkins',
  badge: 'badges',
  monster: 'monsters',
  reward: 'rewards',
  redemption: 'redemptions',
  exam: 'exams',
}

/**
 * 入队一批"写"操作：给行补 uuid/updatedAt/profileId 并**回写本地**，再压 outbox。
 * uuid 必须持久化到本地行——每次重算会让云端长出一堆永不更新的孤儿记录。
 *
 * `keepUpdatedAt`：全量重推（登录 / 恢复备份）时传 true，走 `syncFieldsFor` 沿用行内既有
 * updatedAt。那种场合若盖上本机时间，本设备会凭 LWW 压掉另一台设备后写的合法修改；
 * 而对 v6 之前导出的老备份（行里根本没有 updatedAt），`syncFieldsFor` 会退回**行内业务
 * 时间戳**（startedAtMs / unlockedAt / date 折算…），而不是 now——同一个理由。
 *
 * ⚠️ 两点硬要求：
 *  ① 业务写与入队必须在**同一个事务**里。`saveSession` 在 `db.sessions.add` 后就返回了，
 *    uuid 回填与入队都发生在之后的后台 microtask；此时切后台 / Safari 回收页面 / IndexedDB
 *    短暂报错，就会留下一条"没有 uuid 也不在 outbox"的孤儿行，从此再也不会被推送。
 *    （另有 `syncNow` 开头的补扫兜底，两层一起才够。）
 *  ② updatedAt 必须钳制未来值（`clampUpdatedAt`），见该函数注释。
 */
export async function enqueuePut(
  kind: SyncKind,
  rows: readonly object[],
  opts: { keepUpdatedAt?: boolean } = {},
): Promise<void> {
  // 纯静态部署（VITE_BACKEND=off）永远不会有账号，入队只会让 outbox 无界增长
  if (!SYNC_ENABLED) return
  if (rows.length === 0) return
  const now = Date.now()
  const table = db.table<AnyRow>(TABLE_OF[kind])
  for (const r of rows) {
    const row = r as AnyRow
    const profileId = typeof row.profileId === 'string' && row.profileId ? row.profileId : 'default'
    const fields = opts.keepUpdatedAt
      ? syncFieldsFor(kind, row, now)
      : { uuid: recordUuid(kind, row, profileId), updatedAt: now, profileId }
    const updatedAt = clampUpdatedAt(fields.updatedAt, now)
    const stamped: AnyRow = { ...row, uuid: fields.uuid, updatedAt, profileId: fields.profileId }
    // 一个事务包住"写业务表 + 入 outbox"，不留"有行无队"的中间态
    await db.transaction('rw', [table, db.outbox], async () => {
      await table.put(stamped)
      await db.outbox.add({ uuid: fields.uuid, kind, payload: toPayload(kind, stamped), updatedAt, op: 'put' })
    })
  }
}

/** 7 个 pushXxx 共用：入队后唤引擎；任何失败都静默——同步绝不打扰训练 */
function fire(kind: SyncKind, rows: readonly object[]): void {
  void enqueuePut(kind, rows)
    .then(() => {
      if (!TEST_MODE && SYNC_ENABLED) kickSync()
    })
    .catch(() => {
      /* IndexedDB 不可用（隐私模式 / 配额耗尽）：忽略，本地仍是可靠源 */
    })
}

export function pushSession(row: SessionRow): void {
  fire('session', [row])
}
export function pushCheckin(row: CheckinRow): void {
  fire('checkin', [row])
}
export function pushBadges(rows: BadgeRow[]): void {
  fire('badge', rows)
}
export function pushMonsters(rows: MonsterRow[]): void {
  fire('monster', rows)
}
export function pushRewards(rows: RewardRow[]): void {
  fire('reward', rows)
}
export function pushRedemptions(rows: RedemptionRow[]): void {
  fire('redemption', rows)
}
export function pushExams(rows: ExamRow[]): void {
  fire('exam', rows)
}

/**
 * 验光记录删除 → 推墓碑。**这是对既有策略的有意变更**（spec §6.1）：
 * deleteExam 原来刻意不推送（注释"删除仅本地，后端是防丢副本非镜像"），单向备份下合理；
 * 但真同步下若不传播删除，A 设备删掉的记录会被 B 设备的数据复活。
 */
export function pushExamDeleted(uuid: string): void {
  if (!uuid || !SYNC_ENABLED) return
  void db.outbox
    .add({ uuid, kind: 'exam', payload: TOMBSTONE, updatedAt: Date.now(), op: 'delete' })
    .then(() => {
      if (!TEST_MODE && SYNC_ENABLED) kickSync()
    })
    .catch(() => {
      /* 静默 */
    })
}

/**
 * 全量入队：注册 / 登录成功、以及恢复备份之后调用，把本地 7 表整体推一遍（存量上云）。
 * 服务端按 uuid 幂等（`ON CONFLICT DO UPDATE … WHERE excluded.updated_at > records.updated_at`），
 * 重复推不产生重复行。
 * ⚠️ **不再在每次启动时调用**——启动只需增量同步（引擎负责），全量入队会白白刷满 outbox。
 */
export async function pushAll(): Promise<void> {
  try {
    const [sessions, checkins, badges, monsters, rewards, redemptions, exams] = await Promise.all([
      db.sessions.toArray(),
      db.checkins.toArray(),
      db.badges.toArray(),
      db.monsters.toArray(),
      db.rewards.toArray(),
      db.redemptions.toArray(),
      db.exams.toArray(),
    ])
    const keep = { keepUpdatedAt: true }
    await enqueuePut('session', sessions, keep)
    await enqueuePut('checkin', checkins, keep)
    await enqueuePut('badge', badges, keep)
    await enqueuePut('monster', monsters, keep)
    await enqueuePut('reward', rewards, keep)
    await enqueuePut('redemption', redemptions, keep)
    await enqueuePut('exam', exams, keep)
    if (!TEST_MODE && SYNC_ENABLED) kickSync()
  } catch {
    // 忽略：本地仍是可靠源
  }
}
