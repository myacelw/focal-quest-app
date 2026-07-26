/**
 * 往**本地** D1 种一个固定的管理员账号，供 `npm run test:api` 跑 admin 端点的正向路径。
 *
 * 为什么要种而不是在测试里 UPDATE is_admin：`wrangler pages dev` 运行期间持着本地 D1 的
 * 文件锁，`wrangler d1 execute --local` 会失败。所以必须在**起服务之前**种好，
 * 然后测试脚本用普通登录接口拿 token 就行——不需要运行期改任何一行数据。
 *
 * 用法（wrangler 没在跑的时候）：
 *   npm run db:migrate:local   # 首次
 *   npm run db:seed:admin
 *
 * 线上不用这个脚本。线上把自己设成管理员是一条手写 SQL，见
 * docs/部署到-Cloudflare-Pages.md 的「管理后台」一节。
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// 与 functions/lib/crypto.ts 的 hashAuthKey 完全一致：sha256(`${serverSalt}:${authKey}`)
const EMAIL = 'admin-seed@example.com'
const AUTH_KEY = 'a'.repeat(64)
const SERVER_SALT = 'seedsalt'
const AUTH_HASH = createHash('sha256').update(`${SERVER_SALT}:${AUTH_KEY}`).digest('hex')
// 8 位、且不含被剔除的易混字符 O/0/I/1/L（isValidInviteCodeShape 会校验形状）
const INVITE_CODE = 'SEEDADMN'
// 固定时间戳：让种子账号在「最近注册」里稳定排在真实账号之后，输出可复现
const CREATED_AT = 1_700_000_000_000

// INSERT OR REPLACE：id / email / invite_code 三个唯一索引任一冲突都整行替换，脚本可反复跑。
// （替换会让该账号旧 token 失去 users 行、下次请求 401，本地开发无所谓。）
const sql = `INSERT OR REPLACE INTO users
  (id, email, auth_hash, server_salt, is_admin, invite_code, invited_by, invite_quota, sync_seq, created_at)
VALUES
  ('seed-admin', '${EMAIL}', '${AUTH_HASH}', '${SERVER_SALT}', 1, '${INVITE_CODE}', NULL, 5, 0, ${CREATED_AT});
`

// 写成 .sql 再用 --file，避开 PowerShell / bash 对 --command 里引号的两套转义规则
mkdirSync('.wrangler', { recursive: true })
const file = '.wrangler/seed-admin.sql'
writeFileSync(file, sql, 'utf8')

const r = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'focal-quest-db', '--local', '--file', file, '--yes'],
  { stdio: 'inherit', shell: true },
)

if (r.status === 0) {
  console.log(`\n✓ 本地管理员已就绪：${EMAIL} / authKey=${AUTH_KEY.slice(0, 8)}…（is_admin=1）`)
  console.log('  现在可以起 wrangler pages dev，再跑 npm run test:api')
} else {
  console.error('\n✗ 种入失败。最常见原因：wrangler pages dev 正在运行（它持着本地 D1 文件锁）——先停掉它再跑。')
}
// 不用 process.exit()：Windows + Node 24 下有未关闭句柄时会触发 libuv 断言、退出码变 127
process.exitCode = r.status === 0 ? 0 : 1
