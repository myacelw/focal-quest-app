# 部署到 Cloudflare Pages（自有域名 + 同域 /api + D1）

前端是纯静态 PWA，后端是同域的 Pages Functions（`functions/api/*` → `/api/*`），数据在 D1。
`public/_headers` 由平台下发 COOP/COEP/CORP（vosk 需要跨域隔离），不再依赖 Service Worker 补头。

## 现有资源（2026-07-26）

| 项 | 值 |
|---|---|
| **线上地址** | **https://fq.myacelw.top** |
| 域名 | `myacelw.top`（腾讯云注册、本人实名；NS 已迁 Cloudflare：`alla` / `peter`.ns.cloudflare.com） |
| Pages 项目 | **`focal-quest-app`** |
| D1 数据库 | `focal-quest-db`，id `3b0cc46c-4b11-4f87-ba62-1bcccde659b7` |
| D1 binding | **`DB`**（代码里按 `env.DB` 取库） |
| 证书 | Cloudflare 自动签发（Google Trust Services），绑定后约数分钟就绪 |

### 为什么 NS 必须迁到 Cloudflare（而不是在腾讯云加 CNAME）

`*.pages.dev` 在国内被 DNS 污染（调研结论，多个独立来源）。若在腾讯云配 `fq CNAME → focal-quest-app.pages.dev`，客户端解析链最后一跳仍要查 `pages.dev`，照样中招。NS 迁到 Cloudflare 后它做 **CNAME 展平**——权威应答里直接返回自己的 anycast IP（实测 `104.21.83.77` / `172.67.217.140`），客户端根本不查 `pages.dev`。
注意 Cloudflare **免费版不支持只托管子域名**（Subdomain Support 属企业版），所以只能整个根域迁过去。

### 自定义域名的绑定步骤（wrangler 做不到，只能在控制台）

`wrangler pages` 只有 dev/project/deployment/deploy/secret/download，**没有 domain 子命令**，全局也无 dns/zone 命令；走 API 需要 API token。所以这一步在 Dashboard 做：
Workers & Pages → `focal-quest-app` → **Custom domains** → Set up a custom domain → 填 `fq.myacelw.top` → Activate。Cloudflare 会自动建 DNS 记录并签证书。

### ⚠️ 两个容易踩且报错不说人话的坑

**① Pages 项目名不能叫 `focal-quest`。** 账号里已有一个同名 **Worker**（当初在控制台建项目时选成了 Worker——新版 Cloudflare 把 Workers 与 Pages 放同一入口，很容易点错；Worker 的域名是 `*.workers.dev`，Pages 的是 `*.pages.dev`，用这个区分）。两者共用命名空间，于是建同名 Pages 项目会被 API 拒绝，且报文只有一句 `An unknown error occurred [code: 8000000]`，完全不提"重名"。故项目名定为 `focal-quest-app`。那个误建的 Worker 留着不影响使用，看着碍眼可以在控制台删掉。

**③ 绑域名后头几分钟 HTTPS 会握手失败**（curl exit 35 / SSL connect error），而 `http://` 已能返回 301。这是证书尚在签发，不是配置错——等几分钟重试即可。判断办法：用 `node -e` 起 tls 连接看证书 `valid_from`，若时间就在刚刚，说明刚签好。

**④ 本机若挂了 fake-ip 模式的代理（Clash 等），DNS 诊断结果全是假的。** 曾据此误判"实测到 pages.dev 被污染"——实际 `198.18.1.113/115/116` 这种**连续递增**的 `198.18.x.x` 是代理为每个域名依次分配的虚拟 IP，真实流量由代理接管（所以会出现"解析到假地址却能 curl 通"的矛盾）。要看真实 DNS 记录，用 DoH 绕开本机 resolver：
```bash
curl -s "https://cloudflare-dns.com/dns-query?name=fq.myacelw.top&type=A" -H "accept: application/dns-json"
```
**更要紧的是：本机测得"能访问"不代表国内能访问**（本机流量过代理）。国内可达性只能在**关掉代理**的真机上用家宽/蜂窝实测，这一步无法由 agent 代劳。

> ✅ **已实测**：2026-07-26 用户在国内 iPad 真机上访问 https://fq.myacelw.top 正常。所以这套「域名在腾讯云注册 + NS 迁 Cloudflare + Pages 绑自定义域名」的**免备案方案在国内确实可用**，不必退回备案路线。

**② D1 的 binding 名不要照抄 `wrangler d1 create` 的输出。** 它会建议 `binding = "focal_quest_db"`，但 binding 名是自己定的、代码全部按 `env.DB` 取库（见 `functions/lib/db.ts` 的 `Env`）。照抄会让所有接口拿到 `undefined` 而在运行时崩，本地 `--local` 未必暴露。

**为什么坚持 Pages 而不是 Worker**：整套后端按 Pages Functions 的**文件路由**组织（`functions/api/auth/login.ts` → `/api/auth/login`）。Worker 要用单入口 + 自己分发路由 + `assets` 配置托管静态文件，等于重写这一层。Pages 虽已进入维护模式，但本项目的用量与形态完全够用。

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

**码 = 一张有 `invite_quota`（默认 5）次使用次数的券。** 已用数由
`COUNT(invited_by) WHERE created_at >= invite_reset_at` 派生——只数**当前世代**。

- **换码**：管理员在设置页「☁️ 云同步」卡点「换一个码」（`POST /api/account/invite`，
  限速 5 次/日/用户）。同一条 UPDATE 写新码与 `invite_reset_at`，**旧码立刻失效、名额重新算起**。
  普通用户没有这个按钮，服务端也会以 403 拒绝。
- **看名额**：所有登录用户在同一张卡上看到「已邀 n/5」（`GET /api/account/invite`）。
  离线时只显示快照码、不显示名额（显示 0/5 是撒谎）。
- **管理后台的邀请排行**分「累计邀请」与「当前码 n/quota」两列：前者是跨世代的历史累计，
  后者才是还能邀几个。合成一个数会出现「已邀 4 / 配额 5」这种误导（实际还剩 4 个）。
- **封停某人的码**：把 `invite_quota` 改 0（无 UI，去 D1 Console 跑 SQL）。
- **提额**：同样是手写 SQL 改 `invite_quota`，本版本刻意不做提额 UI。

⚠️ `BOOTSTRAP_INVITE_CODE` secret **无限量且不可追溯**（`invited_by` 记 NULL），
是系统里唯一绕过配额的路径。管理员能自助换码之后它已无存在理由——**站长注册完就该删掉**。

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

**真机局域网联调**（iPad / 手机，真机唯一路径）：终端 A 同上，终端 B 改成 `npm run dev:lan`，
真机访问 `https://<电脑IP>:5173`（首次信任自签证书）。手机自迭代 3d 起也是目标形态（竖屏），
同样按这条路径联调。`npm start` 已把"后端"进程
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

## 管理后台（迭代 3e）

`GET /api/admin/stats` + PWA 内的懒加载管理页。入口在**设置 → 云同步分组**，
**只有 `users.is_admin = 1` 的账号能看到**；端点自己也校验（没登录 401，登录了但不是管理员 403）。

### 把自己设成管理员（不做提权 UI）

刻意没有"提升为管理员"的界面：自用后台，提权入口是纯粹的攻击面——一个页面 + 一个端点，
只为了一辈子按一次的操作。线上执行一次这条 SQL 即可：

```bash
npx wrangler d1 execute focal-quest-db --remote --command "UPDATE users SET is_admin = 1 WHERE email = 'your-parent-email@example.com'"
npx wrangler d1 execute focal-quest-db --remote --command "SELECT email, is_admin FROM users WHERE is_admin = 1"
```

⚠️ **改完要在 App 里退出登录再重新登录一次。** 服务端每次请求都现读 `users.is_admin`，
所以接口立刻生效；但客户端那份 `isAdmin` 是**登录响应写进 `syncMeta` 的快照**，
不重新登录设置页里永远看不到入口。（一期刻意不做 token 刷新。）

本地开发要跑管理员路径，用种子脚本（**必须在 `wrangler pages dev` 没在跑的时候**，
它持着本地 D1 的文件锁）：

```bash
npm run db:seed:admin     # 种入 admin-seed@example.com / is_admin=1，供 npm run test:api
```

注意种子账号的 `authKey` 是脚本硬写的 64 位 hex，**真实登录界面派生不出同一个值**——
它只给 `scripts/test-api.mjs` 用。想在浏览器里看管理页，就用上面那条 `UPDATE ... --local`
把自己注册的本地账号设成管理员。

### 后台展示什么

| 区块 | 口径 |
|---|---|
| 注册账号 | `COUNT(*) FROM users` |
| 云端记录 | 各 `kind` 计数之和（**刻意不再单独 `COUNT(*) FROM records`**，省一整遍全表扫，见下方配额说明） |
| 活跃设备·30天 | `COUNT(*) FROM tokens WHERE last_seen_at >= 30 天前`。**不是 `COUNT(*)`**：`tokens` 行从不删除（退出登录只清本地 `syncMeta`，服务端没有任何 `DELETE FROM tokens`，365 天 TTL 也只在 `requireUser` 里判），累计数是"签发过多少令牌"、会一路涨 |
| 日活 / 周活 / 月活 | 近 1 / 7 / 30 个**东八区日**内有 `kind='session'` 记录的**去重用户**，按 `updated_at` |
| 打开过 App | `tokens.last_seen_at` 的去重用户（辅口径，"打开过"≠"练了"） |
| 每日训练节数 | 近 30 天按 `updated_at` 分日（东八区）的 `kind='session'` 条数 |
| 各类记录量 | `records` 按 `kind` 分组，7 类固定顺序、缺的补 0；括号里是近 7 天新增（增速） |
| 最近注册 | `users` 按 `created_at` 倒序 20 条，邀请人 email 靠 `LEFT JOIN users p ON p.id = u.invited_by` |
| 邀请排行 | 按 `invited_by` 聚合的邀请数与配额，同邀请数按邀请人注册时间倒序 |
| 滥用与请求计数 | `counters` 近 30 天按 metric 汇总，**排除 `rl.%`** |

**分日键用的是 `records.updated_at`（客户端写下记录的时刻，即"练的时候"），不是 `received_at`。**
`updated_at` 是一**列**（客户端 `Date.now()`，超前的未来值在入队时已被 `clampUpdatedAt` 钳掉），
读列不违反"服务端不解析 payload"那条铁律。不用 `received_at` 有两个硬理由：

- 离线几天再联网，那几天的训练会全部堆到**补传当天**，曲线与 DAU 整体失真；
- `functions/api/sync/push.ts` 的 `ON CONFLICT` 里写着 `received_at = excluded.received_at`，
  任何一次 LWW 覆盖（checkins 重算后回推、恢复备份后 `updatedAt` 被抬高）都会把该行的
  `received_at` 前移，于是**历史那根柱子会回溯变矮**，后台数字不可复现。

`received_at` 仍然有用，但只用在下面的排障 SQL 里（"什么时候同步到的"）。

**剩下的偏差**（后台底部也写着）：①分日从此依赖设备时钟——"时钟快"已被钳制，"时钟慢"会把训练
记到更早的日子；②日界按**北京时间**（`strftime(..., '+8 hours')`），不按 UTC，因为 UTC 的日界
等于北京时间早上 8 点，会把清晨的训练算到前一天、也不算进当天 DAU；作为代价，滥用计数那个
30 天窗口的边界与 `counters.date`（UTC）错开最多一天，30 天窗口最远端差一天无信息损失。
真要精确按训练日看，用前端「统计」页——那是从本地 `sessions` 算的。

**为什么只有手动「刷新」、没有自动轮询**：这不只是 UX 取舍，主要是 **D1 免费层 500 万行读/日**
的配额保护。一次刷新要扫 `records` 三遍（`GROUP BY kind` 全表 + 两条 `kind='session'` 分区扫）；
push 端点允许单账号 10 万行（`MAX_TOTAL_RECORDS`），到那个量级一次刷新就是十几万行读。
而这份配额**与云同步共用同一个 D1**——耗尽了不是"后台看不了"，而是"训练数据同步不上"。
所以：8 条查询打成一次 `env.DB.batch()`、`云端记录` 由 kind 分组求和、永不自动刷新。
（另注：改用 `updated_at` 后 `idx_records_kind(kind, received_at)` 只吃到 `kind` 前缀，
家庭量级无所谓，这里记一笔以免将来困惑。）

`rl.%` 前缀的行**不会出现在界面上**：它们是固定窗口限速的内部计数桶，
metric 里编着 IP 与邮箱（`rl.login.<email>.<ip>.<窗口号>`）。要看只能在 D1 Console 里手查。

### 即席查询不做 UI——直接跑 SQL

复杂或一次性的问题不值得为它做界面，也没必要开放"任意 SQL"的 API 攻击面。
去 Cloudflare 控制台 → D1 → `focal-quest-db` → Console，或用 `wrangler d1 execute ... --remote --command`。
常用几条：

```sql
-- 某账号云端各 kind 条数
SELECT kind, COUNT(*) AS n FROM records
 WHERE user_id = (SELECT id FROM users WHERE email = 'x@y.com') GROUP BY kind;

-- 谁的记录最多（排查异常写入 / 配额告警）
SELECT u.email, COUNT(*) AS n FROM records r JOIN users u ON u.id = r.user_id
 GROUP BY u.email ORDER BY n DESC;

-- 邀请树（谁邀请了谁、什么时候）
SELECT p.email AS inviter, c.email AS invitee, datetime(c.created_at / 1000, 'unixepoch') AS at
  FROM users c LEFT JOIN users p ON p.id = c.invited_by ORDER BY c.created_at DESC;

-- 限速桶（含 IP 与邮箱，界面刻意不展示）
SELECT date, metric, value FROM counters WHERE metric LIKE 'rl.%' ORDER BY value DESC LIMIT 20;

-- 封停某人的邀请码：配额改 0
UPDATE users SET invite_quota = 0 WHERE email = 'x@y.com';

-- 某账号最近同步了什么（只看元数据，不看 payload）。这里 received_at 用得其所：
-- 它回答的正是"什么时候**同步到**的"；要看"什么时候**练**的"请用 updated_at（下一条）
SELECT kind, datetime(received_at / 1000, 'unixepoch') AS at, seq FROM records
 WHERE user_id = (SELECT id FROM users WHERE email = 'x@y.com') ORDER BY seq DESC LIMIT 20;

-- 某账号按**训练日**（东八区）的节数，与后台曲线同口径
SELECT strftime('%Y-%m-%d', updated_at / 1000, 'unixepoch', '+8 hours') AS day, COUNT(*) AS n
  FROM records
 WHERE kind = 'session' AND user_id = (SELECT id FROM users WHERE email = 'x@y.com')
 GROUP BY day ORDER BY day DESC LIMIT 30;
```

### 明确不做

- **不加匿名遥测**：统计只覆盖注册并同步的账号。给儿童应用加遥测的隐私与合规成本不值，
  而家庭规模下装机量 ≈ 注册量，多花的代价换不到信息。
- **不做即席查询 UI**（见上）。
- **不做多档案维度**：3c 已决定不实施，`profile_id` 恒为 `'default'`。
- **不做提权 / 封号 / 删号 UI**：一律 SQL。
