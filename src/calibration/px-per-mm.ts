import { lsGet } from '../data/storage'

/**
 * 屏幕标定乘数（CSS 像素 / 毫米）的唯一读取出口。
 *
 * 视标的物理尺寸是 `毫米设定 × 这个乘数`，所以它和毫米数一样是医学参数。原先
 * ChallengePage / SettingsPage / TrainingPage 各写一份 `v ? Number(v) : null`：
 * `Number('abc')` 是 `NaN`，而 `NaN !== null`，于是 `heightPx = mm × NaN = NaN`，
 * 视标直接渲染不出来。与 `sanitizeSizeMm`、`sanitizeDurationSec` 是同一类洞。
 *
 * ⚠️ **脏值归 `null` 而不是归一个默认数**——这一点与 `sanitizeSizeMm` 刻意相反。
 * 编一个默认乘数会让 app 继续训练，但视标的物理尺寸是错的，而且**没有任何人会
 * 察觉**（画面上就是一个大小看着还行的 E）。归 null 则让三个页面走各自已有的
 * 「请先完成屏幕标定」分支，逼用户重新标定——对医学参数来说，拒绝服务远好于
 * 静默给出错误刺激。
 */

/**
 * 合理区间。下界取得比标定 UI 能产出的最小值（`MIN_CARD_PX 150 ÷ CARD_WIDTH_MM 85.6 ≈ 1.75`）
 * 更宽松，确保永远不会误杀一个用户真的标定出来的值；上界 40 远高于任何真实屏幕
 * （2160 CSS px 宽的屏按卡片短边 53.98mm 标定才到 40），只用来挡住 `1e6` 这类脏值。
 */
export const PX_PER_MM_MIN = 1
export const PX_PER_MM_MAX = 40

/** 脏值/越界/未标定一律 null；只有落在合理区间的有限正数才通过 */
export function sanitizePxPerMm(v: number | null): number | null {
  if (v === null || !Number.isFinite(v)) return null
  if (v < PX_PER_MM_MIN || v > PX_PER_MM_MAX) return null
  return v
}

export function readPxPerMm(): number | null {
  const raw = lsGet('fzp.cssPxPerMm')
  return sanitizePxPerMm(raw === null || raw === '' ? null : Number(raw))
}
