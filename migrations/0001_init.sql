-- 迭代 3b 云同步：账号 + 记录同步 + 计数。
-- 设计要点见 docs/superpowers/specs/2026-07-25-域名账号云同步-design.md §6。

-- 家长账号。密码为"客户端 PBKDF2 拉伸后的 authKey"再经服务端加盐单次 SHA-256，
-- 服务端不做拉伸（Workers 免费层 CPU 仅 ~10ms）。
CREATE TABLE users (
  id            TEXT PRIMARY KEY,          -- 随机 uuid
  email         TEXT NOT NULL UNIQUE,      -- 已 normalize（小写去空格）
  auth_hash     TEXT NOT NULL,             -- SHA-256(server_salt || authKey) 的 hex
  server_salt   TEXT NOT NULL,             -- 每用户独立随机盐 hex
  is_admin      INTEGER NOT NULL DEFAULT 0,
  invite_code   TEXT NOT NULL UNIQUE,      -- 本账号的专属邀请码
  invited_by    TEXT,                      -- 邀请人 user_id；站长为 NULL
  invite_quota  INTEGER NOT NULL DEFAULT 5,-- 可邀请人数上限；改为 0 即封停其码
  sync_seq      INTEGER NOT NULL DEFAULT 0,-- 该用户已分配的最大 seq（预留区间法，见 §6.3）
  created_at    INTEGER NOT NULL
);

-- 会话令牌：只存哈希，泄库不泄会话。
CREATE TABLE tokens (
  token_hash   TEXT PRIMARY KEY,           -- SHA-256(token) 的 hex
  user_id      TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL            -- 兼作"打开过 app"的活跃口径
);
CREATE INDEX idx_tokens_user ON tokens(user_id);

-- 同步记录：一行 = 一条业务记录的最新快照。服务端不解析 payload。
CREATE TABLE records (
  user_id     TEXT NOT NULL,
  uuid        TEXT NOT NULL,               -- 同步身份（自然键派生或随机），见 §6.1
  profile_id  TEXT NOT NULL DEFAULT 'default',
  kind        TEXT NOT NULL,               -- session|checkin|badge|monster|reward|redemption|exam
  payload     TEXT NOT NULL,               -- JSON 字符串；{"_deleted":true} 为墓碑
  updated_at  INTEGER NOT NULL,            -- 客户端逻辑时间，LWW 判据
  received_at INTEGER NOT NULL,            -- 服务端落库时间，供管理统计与排障
  seq         INTEGER NOT NULL,            -- 拉取游标；UPDATE 时也递增
  PRIMARY KEY (user_id, uuid)
);
-- 拉取走这个索引：WHERE user_id=? AND seq>? ORDER BY seq
CREATE INDEX idx_records_pull ON records(user_id, seq);
-- 管理后台按 kind 与时间统计
CREATE INDEX idx_records_kind ON records(kind, received_at);

-- 按日计数：滥用监控与运营统计共用。
CREATE TABLE counters (
  date   TEXT NOT NULL,                    -- YYYY-MM-DD（UTC，仅用于粗粒度趋势）
  metric TEXT NOT NULL,                    -- 如 register.ok / register.badcode / login.ratelimit
  value  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, metric)
);
