/**
 * 竖屏布局预算：训练页三段（导航 / 顶栏 / 舞台 / 答题带）在给定视口里各占多少。
 *
 * 为什么要有这个文件：src/index.css 里的响应式数字（断点、方向盘 min() 三档、画布上限、
 * 太矮提示阈值）必须有唯一出处，否则 CSS 与代码会各自漂移。这里的常量是权威，
 * src/layout/css-contract.test.ts 会读 index.css 文本核对两边一致。
 *
 * 铁律：这里算的都是"周围怎么排"。视标 E 的物理尺寸恒为 毫米设定 × 屏幕标定，
 * 与视口无关、不参与任何缩放（见 CLAUDE.md 关键医学参数）。
 */

/** 手机窄屏断点：≤560px 走"图标导航 + 紧凑排布"。
 *  560 的由来：5 项文字导航单行需 461px(中文) / 531px(英文)，低于此必折行；
 *  折行让导航从 57px 变 99px，正是"↓ 按钮掉出首屏"的根因。 */
export const PHONE_MAX_W_PX = 560
/** 矮屏断点（手机横屏 / iPad 分屏）：≤560px 高时方向盘按高度收缩。 */
export const SHORT_MAX_H_PX = 560
/** 实测：5 项文字导航单行所需最小宽度（英文最长；中文 461px）。 */
export const NAV_ONE_LINE_MIN_PX = 531

/** 皮肤方形画布上限（与今天 SpaceStage/ShrineStage 的 maxWidth:420 一致）。 */
export const CANVAS_MAX_PX = 420

/** 方向盘边长的三个上限档（对应 CSS 的 min() 三参数）。 */
export const DPAD_MAX_PX_PHONE = 240
export const DPAD_MAX_PX_WIDE = 210
export const DPAD_VW_PHONE = 66
export const DPAD_VW_WIDE = 58
export const DPAD_DVH_PHONE = 30
export const DPAD_DVH_SHORT = 34

/** 训练页顶栏（眼别 chip + 进度条 + 计时 + 暂停/静音）实测高度。 */
export const TOP_BAR_PX = 45
/** 答题带 = 方向盘 + 语音提示行 + 上下内边距。 */
export const ANSWER_BAND_EXTRA_PX = 34
/** 导航实测高度：窄屏图标一行 60px；宽屏文字一行 57px。 */
export const NAV_H_PHONE_PX = 60
export const NAV_H_WIDE_PX = 57

/** 舞台正方形边长下限：低于此，皮肤装饰无法承载视标（此时提示家长，绝不缩视标）。 */
export const MIN_STAGE_PX = 96
/** CSS 里"屏幕太矮"提示的媒体查询阈值（@media (max-height: 359px)）。
 *  刻意比真正放不下的高度保守——先提示，再破版。 */
export const TRAIN_WARN_MAX_H_PX = 359

export type LayoutMode = 'phone' | 'short' | 'wide'

/** 与 CSS 一致：max-height 规则写在 max-width 之后，故矮屏优先。 */
export function layoutMode(vw: number, vh: number): LayoutMode {
  if (vh <= SHORT_MAX_H_PX) return 'short'
  if (vw <= PHONE_MAX_W_PX) return 'phone'
  return 'wide'
}

export function navHeightPx(vw: number): number {
  return vw <= PHONE_MAX_W_PX ? NAV_H_PHONE_PX : NAV_H_WIDE_PX
}

/** 对应 CSS：.fq-dpad { width: min(210px, 58vw) }，手机/矮屏各有覆盖档。 */
export function dpadSidePx(vw: number, vh: number): number {
  const mode = layoutMode(vw, vh)
  if (mode === 'phone') {
    return Math.min(DPAD_MAX_PX_PHONE, (vw * DPAD_VW_PHONE) / 100, (vh * DPAD_DVH_PHONE) / 100)
  }
  if (mode === 'short') {
    return Math.min(DPAD_MAX_PX_WIDE, (vw * DPAD_VW_WIDE) / 100, (vh * DPAD_DVH_SHORT) / 100)
  }
  return Math.min(DPAD_MAX_PX_WIDE, (vw * DPAD_VW_WIDE) / 100)
}

export function answerBandPx(vw: number, vh: number): number {
  return dpadSidePx(vw, vh) + ANSWER_BAND_EXTRA_PX
}

/** 舞台可用高度 = 视口高 − 导航 − 顶栏 − 答题带。 */
export function stageHeightPx(vw: number, vh: number): number {
  return vh - navHeightPx(vw) - TOP_BAR_PX - answerBandPx(vw, vh)
}

/** 舞台正方形边长——对应 CSS 的 width: min(100%, 420px, 100cqh)。 */
export function stageSidePx(vw: number, vh: number): number {
  return Math.min(vw, CANVAS_MAX_PX, Math.max(0, stageHeightPx(vw, vh)))
}

/** 三段是否都放得下（false → 训练页显示"屏幕太矮"提示，视标仍不缩）。 */
export function everythingFits(vw: number, vh: number): boolean {
  return stageSidePx(vw, vh) >= MIN_STAGE_PX
}
