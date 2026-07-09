import type { BadgeDef } from './badge-defs'
import { BADGES } from './badge-defs'
import { asset } from '../data/asset'
import { useT } from '../i18n'

type T = (key: string, params?: Record<string, string | number>) => string

function metricSuffix(metric: BadgeDef['metric'], t: T): string {
  const KEY: Record<BadgeDef['metric'], string> = {
    maxStreak: 'unit.day',
    totalSessions: 'unit.session',
    totalSec: 'unit.minute',
    maxCpm: 'unit.cpm',
    maxAccuracy: 'unit.percent',
    totalCorrect: 'unit.question',
  }
  return t(KEY[metric])
}

/** 达标目标文案，如 "7天" / "10CPM" / "90%"（解锁后也保留，说明这枚徽章代表什么） */
function goalText(def: BadgeDef, t: T): string {
  if (def.metric === 'maxAccuracy') return `${Math.round(def.threshold * 100)}${metricSuffix(def.metric, t)}`
  const thr = def.metric === 'totalSec' ? Math.round(def.threshold / 60) : def.threshold
  return `${thr}${metricSuffix(def.metric, t)}`
}

/** 未解锁时的进度文案，如 "5/7 天" */
function progressText(def: BadgeDef, current: number, t: T): string {
  if (def.metric === 'maxAccuracy') {
    return `${Math.round(current * 100)}/${Math.round(def.threshold * 100)}${metricSuffix(def.metric, t)}`
  }
  const cur = def.metric === 'totalSec' ? Math.round(current / 60) : Math.floor(current)
  const thr = def.metric === 'totalSec' ? Math.round(def.threshold / 60) : def.threshold
  return `${cur}/${thr}${metricSuffix(def.metric, t)}`
}

/**
 * 勋章在两张 4×4 宫格图里的位置。
 * sheet1 = BADGES[0..15]（顺序）；sheet2 行1-3 = BADGES[16..27]，
 * 行4 前 2 格是 AI 多画的废格，五百智慧星/千题大博士在第 14/15 格。
 */
export function spritePos(id: string): { sheet: 1 | 2; row: number; col: number } {
  const i = BADGES.findIndex((b) => b.id === id)
  if (i < 16) return { sheet: 1, row: Math.floor(i / 4), col: i % 4 }
  const j = i - 16
  const cell = j < 12 ? j : j === 12 ? 14 : 15
  return { sheet: 2, row: Math.floor(cell / 4), col: cell % 4 }
}

export function BadgeCard({ def, unlocked, current }: { def: BadgeDef; unlocked: boolean; current: number }) {
  const t = useT()
  const name = t(`badge.${def.id}`)
  const { sheet, row, col } = spritePos(def.id)
  return (
    <div
      style={{
        width: 132,
        padding: '14px 10px',
        borderRadius: 18,
        textAlign: 'center',
        background: '#fff',
        border: unlocked ? '1.5px solid #ffd93d' : '1px solid var(--line)',
        boxShadow: unlocked ? '0 8px 18px -8px rgba(255,180,0,0.4)' : '0 6px 14px -8px rgba(124,108,240,0.2)',
      }}
      title={name}
    >
      {/* 96×96 图标：从 4×4 宫格图切片，圆环边框是图自带的 */}
      <div
        style={{
          width: 96,
          height: 96,
          margin: '0 auto',
          backgroundImage: `url(${asset(`/badges/sheet${sheet}.webp`)})`,
          backgroundSize: '400% 400%',
          backgroundPosition: `${(col / 3) * 100}% ${(row / 3) * 100}%`,
          backgroundRepeat: 'no-repeat',
          opacity: unlocked ? 1 : 0.4,
          filter: unlocked ? 'none' : 'grayscale(1)',
        }}
      />
      <div style={{ fontSize: 14, marginTop: 8, fontWeight: 700, color: unlocked ? 'var(--ink)' : 'var(--muted)' }}>{name}</div>
      <div style={{ fontSize: 12, marginTop: 3, fontWeight: unlocked ? 700 : 400, color: unlocked ? '#e0a400' : 'var(--muted)' }}>
        {unlocked ? `✓ ${goalText(def, t)}` : progressText(def, current, t)}
      </div>
    </div>
  )
}
