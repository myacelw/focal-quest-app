import { describe, it, expect } from 'vitest'
import { hasKey } from './i18n'
import { MONSTER_DEFS } from './dex/monster-defs'

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

/** 限时挑战文案（迭代 2·限时挑战） */
const CHALLENGE_KEYS = [
  'challenge.title', 'challenge.sub', 'challenge.notTraining',
  'challenge.homeCard', 'challenge.homeCardHint',
  'challenge.best', 'challenge.noBest', 'challenge.start',
  'challenge.ready', 'challenge.readyHint', 'challenge.paceHint',
  'challenge.score', 'challenge.time', 'challenge.timeout',
  'challenge.done', 'challenge.newRecord',
  'challenge.correctCount', 'challenge.wrongCount', 'challenge.timeoutCount',
  'challenge.bestStreak', 'challenge.again', 'challenge.back',
]

/** 训练完成门槛文案（2026-07-27） */
const GOAL_KEYS = [
  'goal.title', 'goal.progress', 'goal.short', 'goal.why', 'goal.noCheckin',
  'goal.streakWarn', 'goal.kept', 'goal.badgeStill', 'goal.retry', 'goal.later',
  'goal.settingsHint',
  'home.partial', 'repair.attempted',
  // 右眼末按钮改中性文案：不能承诺"完成并打卡"却落到"今天还差一点点"
  'train.finishRound',
]

/** 设置页「📐 视标与时长」折叠卡（spec §7.7：影响训练量的两项降低可达性） */
const TRAINING_LOAD_KEYS = ['settings.trainingLoad', 'settings.trainingLoadHint']

/** 卡册的界面文案键（不含 64 个卡名，那些单独校验） */
const CARD_UI_KEYS = [
  'card.pageTitle', 'card.homeCard', 'card.open', 'card.complete', 'card.allComplete',
  'card.notEnough', 'card.locked', 'card.progress', 'card.obtainedAt', 'card.got',
  'card.rarity.common', 'card.rarity.rare', 'card.rarity.shiny',
  'card.set.pony', 'card.set.deep',
]

/**
 * 64 个卡名。缺任何一条不会崩、只会回落到「套名 #编号」（CardAlbum.cardName），
 * 正因为这个兜底太安静，才需要一条断言把"漏了一半卡名"这种事捅出来。
 */
const CARD_NAME_KEYS = ['pony', 'deep'].flatMap((set) =>
  Array.from({ length: 32 }, (_, i) => `card.${set}.${String(i + 1).padStart(2, '0')}`),
)

/** 魔法森林皮肤 + 三个世界的新怪名 */
const FOREST_UI_KEYS = ['skin.forest', 'dex.world.forest', 'forest.counter', 'forest.reweaving']

/**
 * 全部怪兽名派生自 MONSTER_DEFS 本身（而非手抄一份 slug 清单）——
 * 手抄清单是快照式的：下次扩池忘了加 i18n 键，手抄清单里没有新 slug，
 * 这条测试照样绿。派生写法让覆盖面自动跟随扩池，参见 src/sync/kinds-parity.test.ts
 * 同类教训。
 */
const NEW_MONSTER_KEYS = MONSTER_DEFS.map((m) => m.nameKey)

/** 闪光变体文案 */
const SHINY_KEYS = ['dex.shiny', 'dex.shinyProgress', 'dex.shinyToggle', 'dex.normalToggle', 'dex.baseComplete']

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

  it('限时挑战 22 个文案键在 zh 与 en 都存在（漏一份就会在另一种语言下回退成中文）', () => {
    expect(CHALLENGE_KEYS.length).toBe(22)
    for (const k of CHALLENGE_KEYS) {
      expect(hasKey('zh', k), `zh 缺 ${k}`).toBe(true)
      expect(hasKey('en', k), `en 缺 ${k}`).toBe(true)
    }
  })

  it('训练完成门槛 14 个文案键在 zh 与 en 都存在（漏一份就会在另一种语言下回退成中文）', () => {
    expect(GOAL_KEYS.length).toBe(14)
    for (const k of GOAL_KEYS) {
      expect(hasKey('zh', k), `zh 缺 ${k}`).toBe(true)
      expect(hasKey('en', k), `en 缺 ${k}`).toBe(true)
    }
    // 旧的「完成并打卡 🎊」已被 train.finishRound 顶替，两份字典都不该再留着它
    expect(hasKey('zh', 'train.finishCheckin'), 'train.finishCheckin 应已删除').toBe(false)
    expect(hasKey('en', 'train.finishCheckin'), 'train.finishCheckin 应已删除').toBe(false)
  })

  it('设置页折叠卡 2 个文案键在 zh 与 en 都存在', () => {
    expect(TRAINING_LOAD_KEYS.length).toBe(2)
    for (const k of TRAINING_LOAD_KEYS) {
      expect(hasKey('zh', k), `zh 缺 ${k}`).toBe(true)
      expect(hasKey('en', k), `en 缺 ${k}`).toBe(true)
    }
  })

  it('卡册 15 个界面文案键在 zh 与 en 都存在（漏一份就会在另一种语言下回退成中文）', () => {
    expect(CARD_UI_KEYS.length).toBe(15)
    for (const k of CARD_UI_KEYS) {
      expect(hasKey('zh', k), `zh 缺 ${k}`).toBe(true)
      expect(hasKey('en', k), `en 缺 ${k}`).toBe(true)
    }
  })

  it('64 个卡名在 zh 与 en 都齐全（缺了只会静默回落成「套名 #编号」，不报错）', () => {
    expect(CARD_NAME_KEYS.length).toBe(64)
    for (const k of CARD_NAME_KEYS) {
      expect(hasKey('zh', k), `zh 缺 ${k}`).toBe(true)
      expect(hasKey('en', k), `en 缺 ${k}`).toBe(true)
    }
  })

  it('森林皮肤 4 个界面键在 zh 与 en 都存在', () => {
    expect(FOREST_UI_KEYS.length).toBe(4)
    for (const k of FOREST_UI_KEYS) {
      expect(hasKey('zh', k), `zh 缺 ${k}`).toBe(true)
      expect(hasKey('en', k), `en 缺 ${k}`).toBe(true)
    }
  })

  it('全部 82 个怪名在 zh 与 en 都齐全（缺了只会显示成 key 本身）', () => {
    expect(NEW_MONSTER_KEYS.length).toBe(82)
    for (const k of NEW_MONSTER_KEYS) {
      expect(hasKey('zh', k), `zh 缺 ${k}`).toBe(true)
      expect(hasKey('en', k), `en 缺 ${k}`).toBe(true)
    }
  })

  it('闪光变体 5 个文案键在 zh 与 en 都存在', () => {
    expect(SHINY_KEYS.length).toBe(5)
    for (const k of SHINY_KEYS) {
      expect(hasKey('zh', k), `zh 缺 ${k}`).toBe(true)
      expect(hasKey('en', k), `en 缺 ${k}`).toBe(true)
    }
  })
})
