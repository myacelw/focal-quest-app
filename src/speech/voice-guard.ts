/*
 * 语音加载的**崩溃自愈闸门**。
 *
 * 现场（2026-09-14 用户实测）：孩子开始训练，提示停在「🎤 语音加载中…」，过一会儿整屏
 * 变白、状态栏转圈——这是 Safari 把页面进程杀了又自动重载，**不是 JS 异常**（异常会被
 * 全局 ErrorBoundary 接成 😵 报错页）。退出重进照旧，等于孩子彻底练不了。
 *
 * 为什么偏偏是那天：模型有 44MB，平时躺在 SW 的运行时缓存里（跨版本保留），加载只需
 * 从本地读；而 iOS 对脚本可写存储有"7 天未访问就清理"的策略，缓存被清掉之后那一次
 * 走的是"重新联网下载"这条最费内存的路——同一份数据在页面里同时存在好几份拷贝，
 * 叠上 worker 解压模型的峰值就越过了 iPad 的进程上限。（拷贝那几份已在 vosk.ts 与
 * sw.ts 里消掉了，本文件管的是**万一还是崩，不能让孩子卡在死循环里**。）
 *
 * 机制：加载前写一条面包屑，加载有结果（成功/失败）就擦掉，**页面正常隐藏/退出**
 * （pagehide）也擦掉。于是"下次启动时面包屑还在" ⇔ 上次是在加载途中被杀的。
 * 命中就跳过这一次自动加载，把语音降级成手动重试，触控/键盘答题完全不受影响。
 *
 * ⚠️ 面包屑只能靠 pagehide 擦：进程被杀时不会有任何事件，这正是它能当崩溃信号的原因。
 */
import { lsGet, lsSet } from '../data/storage'

export const LS_VOICE_ENABLED = 'fzp.voiceEnabled'
export const LS_VOICE_PENDING = 'fzp.voiceLoading'
export const LS_VOICE_CRASHES = 'fzp.voiceCrashes'

/** 连续几次"加载途中被杀"就停掉自动加载。取 1：第二次开练就该是能用的。 */
export const VOICE_CRASH_LIMIT = 1

/** 训练页该不该自动起语音 */
export type VoiceGate =
  | 'start' /** 正常加载 */
  | 'off' /** 家长在设置页关了 */
  | 'crash-guard' /** 上次加载途中进程被杀，本次不自动加载，只留手动重试 */

export function decideVoiceGate(enabled: boolean, crashes: number): VoiceGate {
  if (!enabled) return 'off'
  if (crashes >= VOICE_CRASH_LIMIT) return 'crash-guard'
  return 'start'
}

/**
 * 开关取值：**严格白名单**（与 optotype-auto 的 readAutoEnabled 同口径）。
 * 用 `!== '0'` 会把手工写的 'false'/'off' 当成开，而写这些字的人显然想关。
 */
export function parseEnabled(raw: string | null): boolean {
  return raw === null || raw === '1'
}

/** 脏值一律归 0：计数只用来触发降级，宁可不触发也不要因为 NaN 永久关掉语音 */
export function parseCrashCount(raw: string | null): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** 启动时结算：面包屑还在 = 上次是在加载途中被杀的 */
export function nextCrashCount(prev: number, pendingFound: boolean): number {
  return pendingFound ? prev + 1 : prev
}

// —— 以下是薄薄的 localStorage 读写封装，逻辑都在上面的纯函数里 ——

export function readVoiceEnabled(): boolean {
  return parseEnabled(lsGet(LS_VOICE_ENABLED))
}

export function writeVoiceEnabled(on: boolean): void {
  lsSet(LS_VOICE_ENABLED, on ? '1' : '0')
}

export function readVoiceCrashes(): number {
  return parseCrashCount(lsGet(LS_VOICE_CRASHES))
}

export function readVoiceGate(): VoiceGate {
  return decideVoiceGate(readVoiceEnabled(), readVoiceCrashes())
}

/** 加载开始：留下面包屑 */
export function noteLoadStart(): void {
  lsSet(LS_VOICE_PENDING, String(Date.now()))
}

/**
 * 加载有结果了：擦掉面包屑。成功时把崩溃计数清零——一次成功就证明这台设备当下扛得住，
 * 没理由继续降级（例如缓存重新建好之后）。失败（网络断/模型 404）不清零也不加，
 * 那不是"被杀"，只是没起来，下次照常再试。
 */
export function noteLoadSettled(ok: boolean): void {
  lsSet(LS_VOICE_PENDING, '')
  if (ok) lsSet(LS_VOICE_CRASHES, '0')
}

/** 页面正常隐藏/退出：擦面包屑，免得把"用户自己退出"误判成崩溃 */
export function clearVoicePending(): void {
  lsSet(LS_VOICE_PENDING, '')
}

/** 启动时调一次。返回 true 表示上次是在加载语音的途中被杀的。 */
export function harvestVoiceCrash(): boolean {
  const pending = !!lsGet(LS_VOICE_PENDING)
  if (!pending) return false
  lsSet(LS_VOICE_PENDING, '')
  lsSet(LS_VOICE_CRASHES, String(nextCrashCount(readVoiceCrashes(), true)))
  return true
}

/** 家长/孩子手动重试：清掉降级状态，让这一次照常加载 */
export function resetVoiceGuard(): void {
  lsSet(LS_VOICE_CRASHES, '0')
  lsSet(LS_VOICE_PENDING, '')
}
