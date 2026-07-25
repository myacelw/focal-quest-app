/**
 * 服务端集成测试：对着 `wrangler pages dev`（本地 D1）跑完整账号与同步流程。
 * 用法：
 *   1) 一个终端：npx wrangler pages dev dist --port 8788
 *   2) 另一个终端：node scripts/test-api.mjs
 * 退出码 0 = 全绿。
 *
 * 注：本地 D1 是持久的，脚本用随机邮箱保证可反复运行；BOOTSTRAP_INVITE_CODE
 * 通过 .dev.vars 提供（见 Task 5 Step 2）。
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

console.log(`\n通过 ${passed}，失败 ${failed}`)
// 注意：这里用 process.exitCode 而非 process.exit()——Windows + Node 24 下若有未关闭的
// fetch keep-alive 连接，process.exit() 会触发 libuv 断言崩溃、退出码变成 127
// （scripts/check-coi.mjs 已踩过同一个坑）。
process.exitCode = failed === 0 ? 0 : 1
