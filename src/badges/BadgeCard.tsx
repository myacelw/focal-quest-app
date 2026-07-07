import type { CSSProperties } from 'react'
import type { BadgeDef, Rarity } from './badge-defs'

const RARITY_BORDER: Record<Rarity, string> = {
  bronze: '#cd7f32',
  silver: '#9aa4ad',
  gold: '#e0a92c',
  rainbow: '',
}

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

export function BadgeCard({ def, unlocked, current }: { def: BadgeDef; unlocked: boolean; current: number }) {
  const rainbow = def.rarity === 'rainbow'
  const borderStyle: CSSProperties = rainbow
    ? { borderImage: 'linear-gradient(135deg,#ff5f6d,#ffc371,#47cf73,#5b8def,#c86dd7) 1', borderWidth: 3, borderStyle: 'solid' }
    : { border: `3px solid ${RARITY_BORDER[def.rarity]}` }

  return (
    <div
      style={{
        width: 92,
        padding: 8,
        borderRadius: 12,
        textAlign: 'center',
        background: '#fff',
        opacity: unlocked ? 1 : 0.45,
        filter: unlocked ? 'none' : 'grayscale(1)',
        ...borderStyle,
      }}
      title={def.name}
    >
      <div style={{ fontSize: 34, lineHeight: 1.1 }}>{def.emoji}</div>
      <div style={{ fontSize: 12, marginTop: 4 }}>{def.name}</div>
      {!unlocked && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{progressText(def, current)}</div>}
    </div>
  )
}
