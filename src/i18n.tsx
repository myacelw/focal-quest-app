import { useSyncExternalStore } from 'react'
import { lsGet, lsSet } from './data/storage'

export type Lang = 'zh' | 'en'

/** 语言选择：localStorage 覆盖优先，否则按浏览器语言（zh* → 中文，其余英文） */
function detect(): Lang {
  const saved = lsGet('fzp.lang')
  if (saved === 'zh' || saved === 'en') return saved
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'zh'
  return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

let current: Lang = detect()
const listeners = new Set<() => void>()

export function getLang(): Lang {
  return current
}
export function setLang(l: Lang): void {
  current = l
  lsSet('fzp.lang', l)
  listeners.forEach((f) => f())
}
function subscribe(f: () => void): () => void {
  listeners.add(f)
  return () => { listeners.delete(f) }
}

/** 订阅当前语言，语言切换时组件自动重渲染 */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, () => current, () => current)
}

type Params = Record<string, string | number>

function fill(s: string, params?: Params): string {
  if (!params) return s
  let out = s
  for (const [k, v] of Object.entries(params)) out = out.replace(`{${k}}`, String(v))
  return out
}

export function translate(lang: Lang, key: string, params?: Params): string {
  const s = DICT[lang][key] ?? DICT.zh[key] ?? key
  return fill(s, params)
}

/** 组件里用：const t = useT(); t('nav.home') / t('home.unlockHint', { n: 3 }) */
export function useT(): (key: string, params?: Params) => string {
  const lang = useLang()
  return (key: string, params?: Params) => translate(lang, key, params)
}

type Dict = Record<string, string>

const ZH: Dict = {
  // 导航
  'nav.home': '首页', 'nav.train': '训练', 'nav.stats': '统计', 'nav.badges': '勋章', 'nav.settings': '设置',
  // 首页
  'home.tagline': '每天几分钟，练出好视力 ✨',
  'home.loading': '加载中…',
  'home.checkedToday': '今天练过啦 ✓ 真棒！',
  'home.notYetToday': '今天还没练，来一局吧！',
  'home.streak': '🔥 连续天数',
  'home.points': '⭐ 累计积分',
  'home.skinProgress': '皮肤解锁进度',
  'home.allSkinsUnlocked': '全部皮肤已解锁 🎉',
  'home.start': '▶ 开始今日训练',
  'home.calibHint': '第一次用请先到「⚙️ 设置 → 📐 屏幕标定」完成一次校准',
  // 训练
  'train.eyeLeft': '左眼 · 遮右眼',
  'train.eyeRight': '右眼 · 遮左眼',
  'train.eyeLeftShort': '左眼',
  'train.eyeRightShort': '右眼',
  'train.flip': '翻转拍子',
  'train.combo': '🔥 连击 ×{n}',
  'train.paused': '已暂停',
  'train.pausedRemain': '剩余 {t}，休息好了继续～',
  'train.resume': '▶ 继续',
  'train.pause': '暂停',
  'train.voiceLoading': '🎤 语音加载中…（可先用按钮）',
  'train.voiceReady': '🎧 在听…说出方向',
  'train.voiceFailed': '🔇 语音没启动，用按钮答',
  'train.voiceButtons': '👇 用下方按钮答',
  'train.calibFirst': '先完成屏幕标定',
  'train.calibFirstBody': '请先到「⚙️ 设置 → 📐 屏幕标定」完成一次校准，视标才能按正确的物理大小显示。',
  'train.ready': '准备好了吗？',
  'train.prepHint': '拍子正镜片面朝眼，坐直、离屏幕约 40cm',
  'train.getReady': '准备中，马上开始…',
  'train.configHint': '配置可在「⚙️ 设置」里调',
  'train.sessionDone': '{eye} · 本节完成',
  'train.correctLabel': '答对',
  'train.nextEye': '换右眼继续 →',
  'train.finishCheckin': '完成并打卡 🎊',
  'train.checkedAlready': '今天已经打过卡啦',
  'train.checkedSuccess': '打卡成功！',
  'train.streakDays': '🔥 连续 {n} 天',
  'train.todayPoints': '今日 +{n} 分',
  'train.totalPoints': '⭐ 累计 {n} 分',
  'train.newBadge': '🎉 解锁新勋章！',
  'train.newSkin': '🎨 解锁新皮肤！',
  'train.trySkinHint': '去「⚙️ 设置」换上试试～',
  // 统计
  'stats.title': '📊 统计',
  'stats.dim.day': '日', 'stats.dim.week': '周', 'stats.dim.month': '月',
  'stats.empty.title': '还没有统计',
  'stats.empty.sub': '先去练一次，这里就会出现你的 CPM、正确率走势啦。',
  'stats.totalSessions': '累计节数',
  'stats.totalMinutes': '累计分钟',
  'stats.avgAccuracy': '平均正确率',
  'stats.weekly': '👨‍👩‍👧 本周小结',
  'stats.times': '次',
  'stats.thisWeek': '本周训练',
  'stats.lastWeek': '（上周 {n}）',
  'stats.avgReaction': '平均反应',
  'stats.accuracy': '正确率',
  'stats.cpmTrend': '📈 CPM 走势',
  'stats.accTrend': '🎯 正确率走势',
  'stats.countChart': '📅 训练次数',
  // 设置
  'settings.title': '⚙️ 设置',
  'settings.sub': '家长在这里配一次，孩子训练时就不用管这些了。',
  'settings.calib': '📐 屏幕标定',
  'settings.calibDone': '已标定（{v} px/mm）——视标物理尺寸才准',
  'settings.calibTodo': '未标定——用银行卡校准一次，视标尺寸才准（先做这步）',
  'settings.recalib': '重新标定',
  'settings.goCalib': '去标定',
  'settings.optotype': '👁️ 视标大小',
  'settings.duration': '⏱️ 单眼时长',
  'settings.minute': '分',
  'settings.flipSpeed': '🔄 翻拍速度',
  'settings.flipFast': '快', 'settings.flipMid': '适中', 'settings.flipSlow': '慢',
  'settings.flipperD': '🔵 拍子度数',
  'settings.skin': '🎨 皮肤',
  'settings.guide': '📖 怎么正确训练',
  'settings.replayGuide': '重看引导',
  'settings.about': '📋 关于训练（家长必读）',
  'settings.language': '🌐 语言',
  'settings.speechTest': '🎤 语音识别测试（调试用）',
  'settings.version': '版本 {v}',
  // 勋章
  'badges.title': '🏅 勋章墙',
  'badges.unlocked': '已解锁 {n} / {total}',
  'badges.cat.maxStreak': '🔥 连续打卡',
  'badges.cat.totalSessions': '🌱 训练积累',
  'badges.cat.totalSec': '⏳ 累计时长',
  'badges.cat.maxCpm': '⚡ 速度里程碑',
  'badges.cat.maxAccuracy': '🎯 精准神眼',
  'badges.cat.totalCorrect': '📚 答题收集',
}

const EN: Dict = {
  'nav.home': 'Home', 'nav.train': 'Train', 'nav.stats': 'Stats', 'nav.badges': 'Badges', 'nav.settings': 'Settings',
  'home.tagline': 'A few minutes a day for sharper eyes ✨',
  'home.loading': 'Loading…',
  'home.checkedToday': 'Done today ✓ Great job!',
  'home.notYetToday': "Not trained today—let's go!",
  'home.streak': '🔥 Day streak',
  'home.points': '⭐ Points',
  'home.skinProgress': 'Skin unlock progress',
  'home.allSkinsUnlocked': 'All skins unlocked 🎉',
  'home.start': "▶ Start today's training",
  'home.calibHint': 'First time? Calibrate once in ⚙️ Settings → 📐 Screen calibration',
  'train.eyeLeft': 'Left eye · cover the right',
  'train.eyeRight': 'Right eye · cover the left',
  'train.eyeLeftShort': 'Left eye',
  'train.eyeRightShort': 'Right eye',
  'train.flip': 'Flip the paddle',
  'train.combo': '🔥 Combo ×{n}',
  'train.paused': 'Paused',
  'train.pausedRemain': '{t} left — resume when ready',
  'train.resume': '▶ Resume',
  'train.pause': 'Pause',
  'train.voiceLoading': '🎤 Loading voice… (buttons work now)',
  'train.voiceReady': '🎧 Listening… say the direction',
  'train.voiceFailed': '🔇 Voice off — use the buttons',
  'train.voiceButtons': '👇 Answer with the buttons below',
  'train.calibFirst': 'Calibrate the screen first',
  'train.calibFirstBody': 'Calibrate once in ⚙️ Settings → 📐 Screen calibration so the optotype shows at the right physical size.',
  'train.ready': 'Ready?',
  'train.prepHint': 'Plus-lens side toward the eyes; sit up, ~40cm from the screen',
  'train.getReady': 'Getting ready, starting soon…',
  'train.configHint': 'Adjust settings in ⚙️ Settings',
  'train.sessionDone': '{eye} · done',
  'train.correctLabel': 'Correct',
  'train.nextEye': 'Switch to right eye →',
  'train.finishCheckin': 'Finish & check in 🎊',
  'train.checkedAlready': 'Already checked in today',
  'train.checkedSuccess': 'Checked in!',
  'train.streakDays': '🔥 {n}-day streak',
  'train.todayPoints': '+{n} points today',
  'train.totalPoints': '⭐ {n} points total',
  'train.newBadge': '🎉 New badge unlocked!',
  'train.newSkin': '🎨 New skin unlocked!',
  'train.trySkinHint': 'Switch to it in ⚙️ Settings ~',
  'stats.title': '📊 Stats',
  'stats.dim.day': 'Day', 'stats.dim.week': 'Week', 'stats.dim.month': 'Month',
  'stats.empty.title': 'No stats yet',
  'stats.empty.sub': 'Train once and your CPM & accuracy trends will show up here.',
  'stats.totalSessions': 'Sessions',
  'stats.totalMinutes': 'Minutes',
  'stats.avgAccuracy': 'Avg accuracy',
  'stats.weekly': '👨‍👩‍👧 This week',
  'stats.times': '',
  'stats.thisWeek': 'sessions this week',
  'stats.lastWeek': ' (last week {n})',
  'stats.avgReaction': 'Avg reaction',
  'stats.accuracy': 'Accuracy',
  'stats.cpmTrend': '📈 CPM trend',
  'stats.accTrend': '🎯 Accuracy trend',
  'stats.countChart': '📅 Session count',
  'settings.title': '⚙️ Settings',
  'settings.sub': 'Set these once as a parent; kids never need to touch them.',
  'settings.calib': '📐 Screen calibration',
  'settings.calibDone': 'Calibrated ({v} px/mm) — optotype size is accurate',
  'settings.calibTodo': 'Not calibrated — align a bank card once so sizes are right (do this first)',
  'settings.recalib': 'Recalibrate',
  'settings.goCalib': 'Calibrate',
  'settings.optotype': '👁️ Optotype size',
  'settings.duration': '⏱️ Time per eye',
  'settings.minute': 'min',
  'settings.flipSpeed': '🔄 Flip speed',
  'settings.flipFast': 'Fast', 'settings.flipMid': 'Medium', 'settings.flipSlow': 'Slow',
  'settings.flipperD': '🔵 Paddle power',
  'settings.skin': '🎨 Skin',
  'settings.guide': '📖 How to train right',
  'settings.replayGuide': 'Replay guide',
  'settings.about': '📋 About training (for parents)',
  'settings.language': '🌐 Language',
  'settings.speechTest': '🎤 Speech recognition test (debug)',
  'settings.version': 'Version {v}',
  'badges.title': '🏅 Badges',
  'badges.unlocked': 'Unlocked {n} / {total}',
  'badges.cat.maxStreak': '🔥 Streaks',
  'badges.cat.totalSessions': '🌱 Sessions',
  'badges.cat.totalSec': '⏳ Total time',
  'badges.cat.maxCpm': '⚡ Speed',
  'badges.cat.maxAccuracy': '🎯 Accuracy',
  'badges.cat.totalCorrect': '📚 Answers',
}

const DICT: Record<Lang, Dict> = { zh: ZH, en: EN }
