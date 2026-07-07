import type { BadgeDef } from './badge-defs'
import { BADGES } from './badge-defs'

const METRIC_SUFFIX: Record<BadgeDef['metric'], string> = {
  maxStreak: '天',
  totalSessions: '节',
  totalSec: '秒',
  maxCpm: 'CPM',
  maxAccuracy: '',
  totalCorrect: '题',
}

/** 未解锁时的进度文案，如 "5/7 天" */
function progressText(def: BadgeDef, current: number): string {
  if (def.metric === 'maxAccuracy') {
    return `${Math.round(current * 100)}/${Math.round(def.threshold * 100)}%`
  }
  const cur = def.metric === 'totalSec' ? Math.round(current / 60) : Math.floor(current)
  const thr = def.metric === 'totalSec' ? Math.round(def.threshold / 60) : def.threshold
  const suffix = def.metric === 'totalSec' ? '分' : METRIC_SUFFIX[def.metric]
  return `${cur}/${thr}${suffix}`
}

/**
 * 勋章在两张 4×4 宫格图里的位置。
 * sheet1 = BADGES[0..15]（顺序）；sheet2 行1-3 = BADGES[16..27]，
 * 行4 前 2 格是 AI 多画的废格，五百智慧星/千题大博士在第 14/15 格。
 */
function spritePos(id: string): { sheet: 1 | 2; row: number; col: number } {
  const i = BADGES.findIndex((b) => b.id === id)
  if (i < 16) return { sheet: 1, row: Math.floor(i / 4), col: i % 4 }
  const j = i - 16
  const cell = j < 12 ? j : j === 12 ? 14 : 15
  return { sheet: 2, row: Math.floor(cell / 4), col: cell % 4 }
}

export function BadgeCard({ def, unlocked, current }: { def: BadgeDef; unlocked: boolean; current: number }) {
  const { sheet, row, col } = spritePos(def.id)
  return (
    <div style={{ width: 132, padding: 12, borderRadius: 16, textAlign: 'center', background: '#fff' }} title={def.name}>
      {/* 96×96 图标：从 4×4 宫格图切片，圆环边框是图自带的 */}
      <div
        style={{
          width: 96,
          height: 96,
          margin: '0 auto',
          backgroundImage: `url(/badges/sheet${sheet}.webp)`,
          backgroundSize: '400% 400%',
          backgroundPosition: `${(col / 3) * 100}% ${(row / 3) * 100}%`,
          backgroundRepeat: 'no-repeat',
          opacity: unlocked ? 1 : 0.4,
          filter: unlocked ? 'none' : 'grayscale(1)',
        }}
      />
      <div style={{ fontSize: 14, marginTop: 8, fontWeight: 600, color: unlocked ? '#222' : '#999' }}>{def.name}</div>
      {!unlocked && <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{progressText(def, current)}</div>}
    </div>
  )
}
