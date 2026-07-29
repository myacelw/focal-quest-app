/**
 * 服务端集成测试：对着 `wrangler pages dev`（本地 D1）跑完整账号与同步流程。
 * 用法：
 *   1) 一个终端：npx wrangler pages dev dist --port 8788
 *   2) 另一个终端：node scripts/test-api.mjs
 * 退出码 0 = 全绿。
 *
 * 注：本地 D1 是持久的，脚本用随机邮箱避免撞 email 唯一约束；BOOTSTRAP_INVITE_CODE
 * 通过 .dev.vars 提供（见 Task 5 Step 2）。
 *
 * 限速计数会跨运行累积（存在 counters 表、按时间窗口分桶）。本脚本每遍成功建 4 个号、
 * 失败 3 次，而额度是成功 20/日、失败 10/时（见 functions/lib/ratelimit.ts）——
 * 也就是**同一天最多跑 5 遍**就会撞上成功额度。撞了不是 bug，见下面的清理办法。
 *
 * 万一真撞了 429：**先停掉 wrangler pages dev**（它持有本地 D1 文件锁，不停的话下面这条
 * 命令会失败），再跑
 *   npm run db:reset:limits
 * 即可清空限速计数。不在本脚本里自动清，正是因为服务运行期间清不掉——留个必然失败的
 * 假动作比没有更糟。
 */
const BASE = process.argv[2] || 'http://127.0.0.1:8788'
// 默认引导码必须本身通过 isValidInviteCodeShape：8 位、且不含被剔除的易混字符
// O/0/I/1/L（所以不能用 "TESTBOOT" 这类含字母 O 的串——形状校验先于引导码比对，
// 会在 register 里直接 400 bad_invite_code）。
const BOOTSTRAP = process.env.BOOTSTRAP_INVITE_CODE || 'TESTBEEF'

let passed = 0
let failed = 0

function check(name, cond, extra = '') {
  if (cond) {
    passed++
    console.log(`✓ ${name}`)
  } else {
    failed++
    console.error(`✗ ${name}${extra ? ' — ' + extra : ''}`)
  }
}

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch { /* 空响应体 */ }
  return { status: res.status, json }
}

// authKey 在真实客户端是 PBKDF2 输出；这里只需一个合法形状的 64 位 hex
const fakeAuthKey = (seed) => seed.padEnd(64, '0').slice(0, 64).replace(/[^0-9a-f]/g, 'a')
const rnd = () => Math.random().toString(36).slice(2, 10)

console.log(`目标：${BASE}\n`)

// ---- 注册 ----
const email1 = `p-${rnd()}@example.com`
const key1 = fakeAuthKey('deadbeef')

let r = await api('/api/auth/register', { method: 'POST', body: { email: email1, authKey: key1, inviteCode: BOOTSTRAP } })
check('引导码可注册站长账号', r.status === 201, `实际 ${r.status} ${JSON.stringify(r.json)}`)
const token1 = r.json?.token
const myInvite = r.json?.inviteCode
check('注册返回 token 与专属邀请码', !!token1 && /^[A-Z0-9]{8}$/.test(myInvite ?? ''), JSON.stringify(r.json))

r = await api('/api/auth/register', { method: 'POST', body: { email: email1, authKey: key1, inviteCode: BOOTSTRAP } })
check('同邮箱重复注册被拒 409', r.status === 409, `实际 ${r.status}`)

r = await api('/api/auth/register', { method: 'POST', body: { email: `x-${rnd()}@example.com`, authKey: key1, inviteCode: 'WRONGCOD' } })
check('错误邀请码被拒 400', r.status === 400, `实际 ${r.status}`)

r = await api('/api/auth/register', { method: 'POST', body: { email: 'notanemail', authKey: key1, inviteCode: BOOTSTRAP } })
check('非法邮箱被拒 400', r.status === 400, `实际 ${r.status}`)

// ---- 邀请归属 ----
const email2 = `q-${rnd()}@example.com`
r = await api('/api/auth/register', { method: 'POST', body: { email: email2, authKey: fakeAuthKey('cafe'), inviteCode: myInvite } })
check('用站长的归属码可注册第二个账号', r.status === 201, `实际 ${r.status} ${JSON.stringify(r.json)}`)
const token2 = r.json?.token
check('第二个账号拿到自己的邀请码（且与站长不同）', r.json?.inviteCode && r.json.inviteCode !== myInvite)

// ---- 邀请码状态 ----
r = await api('/api/account/invite')
check('无 token 读邀请码状态得 401', r.status === 401, `实际 ${r.status}`)

r = await api('/api/account/invite', { token: token1 })
check('登录用户可读自己的邀请码状态',
  r.status === 200 && r.json?.inviteCode === myInvite && r.json?.quota === 5,
  JSON.stringify(r.json))
check('已用数与实际邀请人数一致（email2 正是用这个码注册的）',
  r.json?.used === 1, JSON.stringify(r.json))

r = await api('/api/account/invite', { method: 'POST' })
check('无 token 换码得 401', r.status === 401, `实际 ${r.status}`)

// token1 是用引导码注册的普通账号（register 一律写 is_admin=0）
r = await api('/api/account/invite', { method: 'POST', token: token1 })
check('非管理员换码得 403（而非 401，区分"没登录"与"没权限"）',
  r.status === 403 && r.json?.error === 'forbidden', `实际 ${r.status} ${JSON.stringify(r.json)}`)

// ---- 登录 ----
r = await api('/api/auth/login', { method: 'POST', body: { email: email1, authKey: key1 } })
check('正确密码可登录', r.status === 200 && !!r.json?.token, `实际 ${r.status}`)

r = await api('/api/auth/login', { method: 'POST', body: { email: email1, authKey: fakeAuthKey('bad') } })
check('错误密码被拒 401', r.status === 401, `实际 ${r.status}`)

r = await api('/api/auth/login', { method: 'POST', body: { email: `nobody-${rnd()}@example.com`, authKey: key1 } })
check('不存在的邮箱同样返回 401（不泄露邮箱是否注册）', r.status === 401, `实际 ${r.status}`)

r = await api('/api/auth/login', { method: 'POST', body: { email: email1.toUpperCase(), authKey: key1 } })
check('邮箱大小写不敏感', r.status === 200, `实际 ${r.status}`)

// ---- 鉴权 ----
r = await api('/api/sync/pull')
check('无 token 拉取被拒 401', r.status === 401, `实际 ${r.status}`)

r = await api('/api/sync/pull', { token: 'f'.repeat(64) })
check('伪造 token 被拒 401', r.status === 401, `实际 ${r.status}`)

// ---- 推送与拉取 ----
const rec = (uuid, kind, payload, updatedAt) => ({ uuid, kind, payload, updatedAt })
const t0 = Date.now()

r = await api('/api/sync/push', {
  method: 'POST', token: token1,
  body: { records: [
    rec('checkin:2026-07-20', 'checkin', { date: '2026-07-20', streak: 1, dailyPoints: 30, totalPoints: 30 }, t0),
    rec('badge:first-session', 'badge', { id: 'first-session', unlockedAt: t0 }, t0),
  ] },
})
check('推送两条记录成功', r.status === 200 && r.json?.accepted === 2, `实际 ${r.status} ${JSON.stringify(r.json)}`)

r = await api('/api/sync/pull?since=0', { token: token1 })
check('拉取拿到刚推的两条', r.json?.records?.length === 2, JSON.stringify(r.json))
check('拉取返回 nextSince 游标', typeof r.json?.nextSince === 'number' && r.json.nextSince > 0)
const seqAfterFirst = r.json?.nextSince

r = await api('/api/sync/pull?since=' + seqAfterFirst, { token: token1 })
check('用游标增量拉取为空（没有重复下发）', r.json?.records?.length === 0, JSON.stringify(r.json))

// 幂等：同 uuid 同 updatedAt 再推一次
r = await api('/api/sync/push', { method: 'POST', token: token1, body: { records: [rec('checkin:2026-07-20', 'checkin', { date: '2026-07-20', streak: 1 }, t0)] } })
check('同 uuid 同时间重推被接受但不产生新行', r.status === 200)
r = await api('/api/sync/pull?since=0', { token: token1 })
check('重推后总行数仍为 2（按 uuid 幂等）', r.json?.records?.length === 2, JSON.stringify(r.json?.records?.length))

// LWW：更新的时间戳应覆盖
r = await api('/api/sync/push', { method: 'POST', token: token1, body: { records: [rec('checkin:2026-07-20', 'checkin', { date: '2026-07-20', streak: 99 }, t0 + 1000)] } })
check('更新的 updatedAt 被接受', r.status === 200)
r = await api('/api/sync/pull?since=0', { token: token1 })
const ck = r.json?.records?.find((x) => x.uuid === 'checkin:2026-07-20')
check('LWW 生效：payload 已是新值', ck?.payload?.streak === 99, JSON.stringify(ck?.payload))
// 这是整个 push 实现最容易写错的一处：若 seq 没随更新递增，其他设备的增量拉取
// （since=旧游标）会永远看不到这次修改。断言必须严格大于旧游标，不能放宽。
check('被更新的行获得了更大的 seq（否则别的设备拉不到这次修改）', ck?.seq > seqAfterFirst, `seq=${ck?.seq} 应 > 旧游标 ${seqAfterFirst}`)

// 直接验证"另一台设备的视角"：拿旧游标增量拉，必须能看到这次更新
r = await api('/api/sync/pull?since=' + seqAfterFirst, { token: token1 })
check('用旧游标增量拉取能拿到被更新的行（多设备同步的核心保证）',
  r.json?.records?.some((x) => x.uuid === 'checkin:2026-07-20' && x.payload?.streak === 99),
  JSON.stringify(r.json?.records))

// LWW：更旧的时间戳不应覆盖
r = await api('/api/sync/push', { method: 'POST', token: token1, body: { records: [rec('checkin:2026-07-20', 'checkin', { date: '2026-07-20', streak: 1 }, t0 - 5000) ] } })
check('更旧的 updatedAt 请求被受理（不报错）', r.status === 200)
r = await api('/api/sync/pull?since=0', { token: token1 })
const ck2 = r.json?.records?.find((x) => x.uuid === 'checkin:2026-07-20')
check('旧数据没有覆盖新数据', ck2?.payload?.streak === 99, JSON.stringify(ck2?.payload))

// 墓碑
r = await api('/api/sync/push', { method: 'POST', token: token1, body: { records: [rec('exam-abc', 'exam', { _deleted: true }, Date.now())] } })
check('墓碑记录可推送', r.status === 200, `实际 ${r.status}`)

// card 是 v7 新增的第 8 类。服务端 kind 白名单是**整批全或无**，所以这两条不只验"能存下"，
// 更是验"card 已经进了 functions/lib/sync-validate.ts 的 KINDS"——漏了的话，孩子那台设备
// 只要开过一包卡，整批 push 就 400，而 400 被判永久错误，连训练记录一起上不去。
r = await api('/api/sync/push', {
  method: 'POST', token: token1,
  body: { records: [rec('card:default:pony-7', 'card', { id: 'pony-7', obtainedAt: t0 }, t0)] },
})
check('推送 card 记录被接受（第 8 类 kind 已进服务端白名单）', r.status === 200 && r.json?.accepted === 1, `实际 ${r.status} ${JSON.stringify(r.json)}`)
r = await api('/api/sync/pull?since=0', { token: token1 })
const cardRec = r.json?.records?.find((x) => x.uuid === 'card:default:pony-7')
check('拉回来的 card 记录 kind 与 payload 原样保留', cardRec?.kind === 'card' && cardRec?.payload?.id === 'pony-7', JSON.stringify(cardRec))

// 账号隔离
r = await api('/api/sync/pull?since=0', { token: token2 })
check('另一个账号拉不到别人的记录（数据隔离）', r.json?.records?.length === 0, JSON.stringify(r.json))

// ---- 校验与配额 ----
r = await api('/api/sync/push', { method: 'POST', token: token1, body: { records: [rec('u1', 'evil', {}, Date.now())] } })
check('未知 kind 被拒 400', r.status === 400 && r.json?.error === 'bad_kind', JSON.stringify(r.json))

r = await api('/api/sync/push', { method: 'POST', token: token1, body: { records: [rec('u2', 'session', { blob: 'x'.repeat(20000) }, Date.now())] } })
check('超大 payload 被拒 400', r.status === 400 && r.json?.error === 'payload_too_large', JSON.stringify(r.json))

r = await api('/api/sync/push', {
  method: 'POST', token: token1,
  body: { records: Array.from({ length: 501 }, (_, i) => rec('bulk' + i, 'session', {}, Date.now())) },
})
check('超过 500 条的批次被拒 400', r.status === 400 && r.json?.error === 'too_many', JSON.stringify(r.json))

r = await api('/api/sync/push', { method: 'POST', token: token1, body: { records: [rec('u3', 'session', {}, Date.now() + 400 * 86400_000)] } })
check('未来过远的 updatedAt 被拒（防 LWW 永久锁死）', r.status === 400, JSON.stringify(r.json))

// ---- 管理后台（迭代 3e）----
// 先推一条 session，让日活与训练量曲线有非零值可断言（前面推的都是 checkin/badge/exam）
r = await api('/api/sync/push', {
  method: 'POST', token: token1,
  body: { records: [rec(`session:default:${t0}:left`, 'session', { startedAtMs: t0, eye: 'left', correct: 5, answered: 6 }, t0)] },
})
check('推入一条 session 供 admin 统计', r.status === 200, `实际 ${r.status} ${JSON.stringify(r.json)}`)

r = await api('/api/admin/stats')
check('无 token 访问 admin 端点得 401', r.status === 401, `实际 ${r.status}`)

// token1 是用引导码注册的普通账号（register 一律写 is_admin=0），正是"登录了但没权限"
r = await api('/api/admin/stats', { token: token1 })
check('非管理员访问 admin 端点得 403（而非 401，区分"没登录"与"没权限"）',
  r.status === 403 && r.json?.error === 'forbidden', `实际 ${r.status} ${JSON.stringify(r.json)}`)

// 管理员账号由 `npm run db:seed:admin` 预先种入（wrangler 运行期间改不了本地 D1）
r = await api('/api/auth/login', { method: 'POST', body: { email: 'admin-seed@example.com', authKey: 'a'.repeat(64) } })
check('种子管理员可登录（若失败：先停 wrangler，跑 npm run db:seed:admin，再重启）',
  r.status === 200 && r.json?.isAdmin === true, `实际 ${r.status} ${JSON.stringify(r.json)}`)
const adminToken = r.json?.token

r = await api('/api/admin/stats', { token: adminToken })
const st = r.json
check('管理员可读统计', r.status === 200, `实际 ${r.status} ${JSON.stringify(r.json)}`)
check('响应含总量三项', typeof st?.totals?.users === 'number' && st.totals.users >= 3
  && typeof st?.totals?.records === 'number' && typeof st?.totals?.tokens === 'number', JSON.stringify(st?.totals))
check('kinds 覆盖全部 8 类记录（缺的补 0，界面不会时多时少）',
  Array.isArray(st?.kinds) && st.kinds.length >= 8
  && ['session', 'checkin', 'badge', 'monster', 'reward', 'redemption', 'exam', 'card']
    .every((k) => st.kinds.some((x) => x.kind === k)),
  JSON.stringify(st?.kinds))
// spec §8 要的是"各 kind 记录量**与增速**"：30 天曲线只覆盖 session，
// 其余 6 类靠这个 recent 才看得出在不在长
check('kinds 每行都带 recent 增速列，且刚推的 session 落进近 7 天',
  st?.kinds?.every((x) => typeof x.recent === 'number')
  && st.kinds.find((x) => x.kind === 'session')?.recent >= 1,
  JSON.stringify(st?.kinds))
check('daily 是连续 30 天且末位是今天（东八区）',
  Array.isArray(st?.daily) && st.daily.length === 30
  && st.daily[29].date === new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10),
  JSON.stringify(st?.daily?.length) + ' ' + JSON.stringify(st?.daily?.[29]))
check('今天的训练量与日活都算上了刚推的 session',
  st?.daily?.[29]?.count >= 1 && st?.active?.dau >= 1,
  `daily=${st?.daily?.[29]?.count} dau=${st?.active?.dau}`)
check('辅口径（打开过 app）也有值', st?.active?.openDau >= 1, JSON.stringify(st?.active))
// 这条是隐私红线：rl.* 桶的 metric 里编着 IP 与邮箱，绝不能出现在响应里
check('滥用计数不含 rl.* 限速桶（metric 里编着 IP 与邮箱）',
  Array.isArray(st?.abuse) && st.abuse.every((x) => !x.metric.startsWith('rl.')),
  JSON.stringify(st?.abuse?.map((x) => x.metric)))
check('最近注册列表带出邀请人邮箱（invited_by 自连接）',
  st?.recentUsers?.some((u) => u.email === email2 && u.invitedByEmail === email1),
  JSON.stringify(st?.recentUsers))
// 刻意**不**断言本轮的 email1 出现在排行里：本地 D1 是持久的（见本文件头部注释），每跑一遍
// 脚本就多一个 invited=1 的邀请人，而 SQL 是 LIMIT 20——跑到几十遍后本轮账号会被历史账号挤出
// 榜单，断言就会无故变红，而失败输出只是一大串 JSON、指不到真正原因（是被 LIMIT 截掉了，
// 不是 SQL 错了）。所以只断言"聚合本身对"。
check('邀请排行有行且每行 invited ≥ 1（只列真的邀请过人的账号）',
  Array.isArray(st?.inviters) && st.inviters.length > 0 && st.inviters.every((x) => x.invited >= 1),
  JSON.stringify(st?.inviters))

// ---- 管理员换码（本迭代核心：换码即重置已用名额）----
r = await api('/api/account/invite', { token: adminToken })
const beforeCode = r.json?.inviteCode
check('管理员可读自己的邀请码状态', r.status === 200 && !!beforeCode, JSON.stringify(r.json))

// 先用管理员的码注册一个人，把"已用数"做上去——否则换码后的 used === 0 什么也证明不了
const email3 = `s-${rnd()}@example.com`
r = await api('/api/auth/register', {
  method: 'POST', body: { email: email3, authKey: fakeAuthKey('feed'), inviteCode: beforeCode },
})
check('管理员的码可用于注册', r.status === 201, `实际 ${r.status} ${JSON.stringify(r.json)}`)

r = await api('/api/account/invite', { token: adminToken })
check('刚才那次注册计入当前码的已用数', r.json?.used >= 1, JSON.stringify(r.json))

r = await api('/api/account/invite', { method: 'POST', token: adminToken })
const afterCode = r.json?.inviteCode
check('管理员换码成功且拿到新码',
  r.status === 200 && !!afterCode && afterCode !== beforeCode,
  `实际 ${r.status} ${JSON.stringify(r.json)}`)
check('换码后已用名额归零（本迭代的核心口径）', r.json?.used === 0, JSON.stringify(r.json))

r = await api('/api/auth/register', {
  method: 'POST', body: { email: `t-${rnd()}@example.com`, authKey: fakeAuthKey('beef'), inviteCode: beforeCode },
})
check('旧码换掉后立刻失效', r.status === 400 && r.json?.error === 'bad_invite_code',
  `实际 ${r.status} ${JSON.stringify(r.json)}`)

r = await api('/api/auth/register', {
  method: 'POST', body: { email: `u-${rnd()}@example.com`, authKey: fakeAuthKey('beef'), inviteCode: afterCode },
})
check('新码可用于注册', r.status === 201, `实际 ${r.status}`)

console.log(`\n通过 ${passed}，失败 ${failed}`)
// 注意：这里用 process.exitCode 而非 process.exit()——Windows + Node 24 下若有未关闭的
// fetch keep-alive 连接，process.exit() 会触发 libuv 断言崩溃、退出码变成 127
// （scripts/check-coi.mjs 已踩过同一个坑）。
process.exitCode = failed === 0 ? 0 : 1
