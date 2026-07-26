import { describe, it, expect } from 'vitest'
import { hasKey } from './i18n'

/** 云同步卡片用到的全部文案键 */
const SYNC_KEYS = [
  'settings.group.cloud', 'sync.title', 'sync.hint', 'sync.localOnly',
  'sync.tab.login', 'sync.tab.register', 'sync.email', 'sync.password', 'sync.invite',
  'sync.consent', 'sync.privacyOpen', 'sync.register', 'sync.login', 'sync.logout',
  'sync.logoutConfirm', 'sync.logoutHint', 'sync.working', 'sync.account', 'sync.myInvite',
  'sync.inviteHint', 'sync.copy', 'sync.copied', 'sync.syncNow', 'sync.lastSynced',
  'sync.neverSynced', 'sync.syncOk', 'sync.syncFailed', 'sync.pending', 'sync.pendingNone',
  'sync.needRelogin', 'sync.noteNoRecovery', 'sync.mergeConfirm',
  'sync.err.badEmail', 'sync.err.badPassword', 'sync.err.badInvite', 'sync.err.inviteUsedUp',
  'sync.err.emailTaken', 'sync.err.badCredentials', 'sync.err.tooMany', 'sync.err.retry',
  'sync.err.quota', 'sync.err.unauthorized', 'sync.err.rejected', 'sync.err.network',
]

/** 隐私政策页用到的全部文案键（6 节各有标题与正文） */
const PRIVACY_KEYS = [
  'privacy.title', 'privacy.updated', 'privacy.back', 'privacy.contact',
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`privacy.s${n}.h`, `privacy.s${n}.b`]),
]

/** 其余新键（家长端超支提示，Task 12 用） */
const OTHER_KEYS = ['reward.overspend']

/** 竖屏适配新增文案（迭代 3d） */
const PORTRAIT_KEYS = ['train.rotateHint', 'train.screenTooSmall']

/** 标定页窄屏新增文案（迭代 3d） */
const CALIB_PORTRAIT_KEYS = [
  'calib.instructionShort', 'calib.edgeLong', 'calib.edgeShort',
  'calib.shortEdgeWhy', 'calib.cantSave', 'calib.savedMismatch',
]

/** 管理后台文案（迭代 3e） */
const ADMIN_KEYS = [
  'admin.title', 'admin.sub', 'admin.entry', 'admin.open', 'admin.loading', 'admin.error',
  'admin.denied', 'admin.refresh', 'admin.updatedAt',
  'admin.totals.users', 'admin.totals.records', 'admin.totals.tokens',
  'admin.dau', 'admin.wau', 'admin.mau', 'admin.openTitle', 'admin.openHint',
  'admin.dailyTitle', 'admin.kindsTitle', 'admin.kindsHint', 'admin.recentTitle', 'admin.recentInviter',
  'admin.recentNoInviter', 'admin.invitersTitle', 'admin.abuseTitle', 'admin.empty', 'admin.caveat',
  'admin.col.email', 'admin.col.at', 'admin.col.invited', 'admin.col.quota',
  'admin.col.metric', 'admin.col.value',
  'admin.metric.register.ok', 'admin.metric.register.badcode', 'admin.metric.register.ratelimit',
  'admin.metric.register.quotaexhausted', 'admin.metric.login.ok', 'admin.metric.login.fail',
  'admin.metric.login.ratelimit', 'admin.metric.push.ok', 'admin.metric.active.user',
  'admin.metric.pushReject',
  ...['session', 'checkin', 'badge', 'monster', 'reward', 'redemption', 'exam']
    .map((k) => `admin.kind.${k}`),
]

describe('云同步与隐私政策文案', () => {
  it('云同步 44 个文案键在 zh 与 en 字典里都存在（漏一份就会在另一种语言下回退成中文）', () => {
    expect(SYNC_KEYS.length).toBe(44)
    for (const k of SYNC_KEYS) {
      expect(hasKey('zh', k), `zh 缺 ${k}`).toBe(true)
      expect(hasKey('en', k), `en 缺 ${k}`).toBe(true)
    }
  })

  it('隐私政策 6 节文案在两种语言都存在（合规文本不能有空白节）', () => {
    for (const k of PRIVACY_KEYS) {
      expect(hasKey('zh', k), `zh 缺 ${k}`).toBe(true)
      expect(hasKey('en', k), `en 缺 ${k}`).toBe(true)
    }
  })

  it('其余新键在两种语言都存在', () => {
    for (const k of OTHER_KEYS) {
      expect(hasKey('zh', k), `zh 缺 ${k}`).toBe(true)
      expect(hasKey('en', k), `en 缺 ${k}`).toBe(true)
    }
  })

  it('竖屏适配新增文案在两种语言都存在', () => {
    for (const k of PORTRAIT_KEYS) {
      expect(hasKey('zh', k), `zh 缺 ${k}`).toBe(true)
      expect(hasKey('en', k), `en 缺 ${k}`).toBe(true)
    }
  })

  it('标定页窄屏新增 6 条文案在两种语言都存在', () => {
    expect(CALIB_PORTRAIT_KEYS.length).toBe(6)
    for (const k of CALIB_PORTRAIT_KEYS) {
      expect(hasKey('zh', k), `zh 缺 ${k}`).toBe(true)
      expect(hasKey('en', k), `en 缺 ${k}`).toBe(true)
    }
  })

  it('管理后台 50 个文案键在 zh 与 en 都存在（漏一份就会在另一种语言下回退成中文）', () => {
    expect(ADMIN_KEYS.length).toBe(50)
    for (const k of ADMIN_KEYS) {
      expect(hasKey('zh', k), `zh 缺 ${k}`).toBe(true)
      expect(hasKey('en', k), `en 缺 ${k}`).toBe(true)
    }
  })
})
