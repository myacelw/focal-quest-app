# 部署到 Cloudflare Pages（自有域名 + 同域 /api + D1）

前端是纯静态 PWA，后端是同域的 Pages Functions（`functions/api/*` → `/api/*`），数据在 D1。
`public/_headers` 由平台下发 COOP/COEP/CORP（vosk 需要跨域隔离），不再依赖 Service Worker 补头。

## 后端（D1 + Pages Functions，迭代 3b-1）

| 端点 | 作用 |
|---|---|
| `POST /api/auth/register` | 注册（需邀请码），返回 token 与本账号专属邀请码 |
| `POST /api/auth/login` | 登录 |
| `POST /api/sync/push` | 推送记录（LWW upsert，按 uuid 幂等） |
| `GET /api/sync/pull?since=` | 按 seq 游标增量拉取 |

### 本地开发

```bash
npm run build && npm run db:migrate:local
npx wrangler pages dev dist --port 8788   # 或 npm run cf:dev
npm run test:api                          # 另开终端，31 项集成断言
```

本地密钥放 `.dev.vars`（已 gitignore）。撞 429 就先停服务再 `npm run db:reset:limits`
（wrangler 持着 D1 文件锁，运行期间清不掉）。

### 数据库迁移

`migrations/*.sql` 顺序执行；改 schema 一律新增文件、不改历史文件：

```bash
npm run db:migrate:local    # 本地
npm run db:migrate:remote   # 线上
```

### 邀请码

注册需邀请码，每个账号有专属码（`users.invite_code`），新用户落库 `invited_by`，注册来源可追溯。
配额 `invite_quota` 默认 5，用量由 `COUNT(invited_by)` 派生。封停某人的码：把配额改 0。
站长开局用 `BOOTSTRAP_INVITE_CODE` secret，注册完应删掉它。

### 备份

D1 免费版 Time Travel 只保留 7 天，所以按月手动导出：

```bash
npx wrangler d1 export focal-quest-db --remote --output backup-YYYY-MM.sql
```

## 客户端云同步（迭代 3b-2）

**铁律：本地 IndexedDB 是唯一可靠源。** 没登录 / 断网 / 后端挂了，训练、打卡、统计、勋章、
兑换全部照常，同步只是尽力而为，失败静默退避。

### 数据流

```
写入点（saveSession / doCheckIn / syncBadges / captureMonster / 兑换 / 验光）
  └─ src/data/api.ts 的 pushXxx（签名自迭代 1 起未变）
       └─ 写 Dexie outbox 表 + 唤同步引擎
            └─ src/sync/engine.ts
                 ├─ push：outbox 去重切批 → POST /api/sync/push → 成功即清队
                 ├─ pull：GET /api/sync/pull?since=游标 → mergeRecord 按 kind 合并入库
                 └─ 重算：reconcileCheckins 重排打卡链 → 变化的行重新入队
```

触发时机：应用启动、入队后（= 单节训练完成）、`online` 事件。失败按 1s→2s→4s…封顶 5 分钟退避。

### 关键约定（改动前务必读）

- **uuid 是同步身份，7 张表全部确定性派生**，形状 `kind:profileId:自然键`：
  `checkin:default:<date>` / `badge:default:<id>` / `monster:default:<id>` /
  `session:default:<startedAtMs>:<eye>` / `reward:default:<createdAt>` /
  `redemption:default:<createdAt>` / `exam:default:<date>:<left>:<right>`。
  两台设备算出同一个值 → 服务端 LWW 天然去重。**别改回随机 uuid**：那会让同一条历史
  （两台都恢复过同一份备份、或两台各自跑过 v5→v6 迁移）在云端变成两行，拉回本地后
  当日答对数翻倍、积分/CPM/正确率/勋章判定全部虚高。uuid 一律**持久化到本地行**，不重算。
  `profileId` 现在就编进 uuid（一期恒为 `default`）——服务端主键是 `(user_id, uuid)`、
  `profile_id` 只是普通列，不带这一维 3c 上线后两个孩子会互相覆盖。
- **payload 剥掉自增表的本地 `id`**：那是各设备独立自增的号，带过去会覆盖对面不相干的行。
- **勋章与怪兽取最早**（`unlockedAt` / `capturedAt` 小者胜），不是 LWW——"首次达成时刻"才是正确语义。
- **拉取后必须重算打卡链**，但**只修链条（streak/totalPoints）、不重算 dailyPoints**。
  dailyPoints 是"打卡当时结算"的事实数据：一天练两轮时 `doCheckIn` 第二轮短路、当天分只按第一轮算；
  补签后 `doRepair` 刻意保留已赚分。按 sessions 重算（哪怕只涨不跌）会让这两种日子白涨分，
  而积分是能换现实奖励和补签卡的**货币**。
- **验光删除推墓碑**（`payload={_deleted:true}`）：不传播删除，A 设备删掉的记录会被 B 设备复活。
  退出登录时 `clearAccount` 只清 `op='put'`、**保留墓碑**——墓碑无从重建（本地行已真删）。
- **推送失败分三类**：0/429/5xx 留队退避；401 停排程等重新登录；其余 4xx 二分定位坏记录、
  只隔离那几条（服务端整批全或无校验，一条毒药会让这台设备从此再也同步不了任何数据）。
- **登录不无条件全量上推**：靠 `syncMeta.boundUserId` 分辨"换了另一个账号"，
  否则借设备给亲友会把别家孩子的记录静默传进对方云端，而一期无自助删号、不可撤回。
- 设置 / 标定 / 皮肤选择**不同步**（设备相关）。
- **已知缺口**：两台设备离线各兑换一次奖励 / 各买一张补签卡会**超额**（余额校验纯本地，
  服务端不校验余额）。家长端「奖励设置」卡在超支时显示「⚠️ 已超支 N 分」，可人工取消一条。

### 构建开关

`VITE_BACKEND=off` 表示"这份构建没有可用的 `/api`"，于是完全不发同步请求。
GitHub Pages 那条链（`deploy.yml`）必须保留它；Cloudflare 这条链（`deploy-cf.yml`）**不要设**。

### 本地联调云同步

```bash
npm run build && npm run cf:dev     # 终端 A：8788 上跑 Functions + 本地 D1
npm run dev                          # 终端 B：5173，/api 已代理到 8788
```

**iPad 局域网联调**（真机唯一路径）：终端 A 同上，终端 B 改成 `npm run dev:lan`，
iPad 访问 `https://<电脑IP>:5173`（首次信任自签证书）。`npm start` 已把"后端"进程
从退役的 `server/`（3001）换成 wrangler（8788），所以一条 `npm start` 也能同时起两边——
但**首次要先跑一次** `npm run build && npm run db:migrate:local`，wrangler 需要 `dist` 才能起。

> ⚠️ `server/`（本机 Node + SQLite 后端）自 3b-2 起**不再被前端调用**，同步语义由
> Pages Functions + D1 取代。目录暂留不删。

⚠️ **PBKDF2 需要安全上下文**：`crypto.subtle` 在 `http://<局域网IP>` 下不可用，所以真机
注册/登录必须走 `dev:lan`（https）或线上域名。`newUuid()` 已对同类问题做了降级
（`crypto.randomUUID` 在非安全上下文为 undefined），但派生 authKey 无法降级。

### 换设备

**先登录再使用**最省事：登录后自动全量拉取。若先离线练了再登录，本地数据会并入该账号
（不做跨账号历史合并）。退出登录只断开云端，本机数据一条不动。

### 排查

```bash
# 看某账号云端有多少条、各 kind 分布
npx wrangler d1 execute focal-quest-db --remote --command "SELECT kind, COUNT(*) FROM records GROUP BY kind"
```

浏览器端：DevTools → Application → IndexedDB → `focalquest` → `outbox`（积压未推的写）
与 `syncMeta`（`lastPulledSeq` / `lastSyncedAt` / `lastError` / `boundUserId`）。

`lastError` 的取值含义：

| 值 | 含义 | 处理 |
|---|---|---|
| `''` | 上次同步正常 | — |
| `network` | 断网 / 5xx / 429 / 异常 | 自动退避重试，无需干预 |
| `unauthorized` | token 失效（改过密码 / 云端被清库） | **排程已停**，需在设置页重新登录 |
| `rejected` | 有记录被服务端永久拒收，已隔离出队 | 云同步卡会显式提示；反复出现要查 payload 体量与设备时钟 |
