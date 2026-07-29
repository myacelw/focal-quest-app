import { describe, it, expect } from 'vitest'

// 用 Vite 的 ?raw 拿源文件文本（本仓没装 @types/node，node:fs 会让 tsc 报 TS2307）。
// 与 src/nav.test.ts、src/admin/admin-entry.test.ts 同一套做法。
import register from '../api/auth/register.ts?raw'

/**
 * 邀请配额的「世代边界」契约。
 *
 * 本迭代的核心口径——换码即重置已用名额——落在 register.ts 那条 used 子查询的
 * `AND c.created_at >= u.invite_reset_at` 上。它写在 SQL 里，**抽不成纯函数**，
 * 而 .github/workflows/deploy-cf.yml 的质量门只跑 npm test / typecheck / build、
 * **从不跑 npm run test:api**，且它是 push master 即构建即部署。
 *
 * 也就是说：谁哪天顺手把这个条件删掉，CI 会一路绿灯把「换码不再重置名额」发到线上，
 * 而且不报错、没有任何症状——管理员换了码，名额却还是用完的状态，没人会想到是这里。
 *
 * 这条契约拦不住语义错误，但能拦住「被删掉」，而后者才是这条口径最可能的死法。
 */
describe('邀请配额的计数口径', () => {
  it('register 的 used 子查询必须带 invite_reset_at 这道世代边界', () => {
    const sub = register.match(/SELECT COUNT\(\*\) FROM users c[\s\S]*?AS used/)
    expect(sub, '没找到 used 子查询——正则要跟着 register.ts 的写法更新').not.toBeNull()
    expect(sub![0]).toContain('invite_reset_at')
  })
})
