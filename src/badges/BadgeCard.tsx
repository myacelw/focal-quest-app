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
    ? { borderImage: 'linear-gradient(135deg,#ff5f6d,#ffc371,#47cf73,#5b8def,#c86dd7) 1', borderWidth: 4, borderStyle: 'solid' }
    : { border: `4px solid ${RARITY_BORDER[def.rarity]}` }

  return (
    <div
      style={{
        width: 132,
        padding: 12,
        borderRadius: 16,
        textAlign: 'center',
        background: '#fff',
        opacity: unlocked ? 1 : 0.45,
        filter: unlocked ? 'none' : 'grayscale(1)',
        ...borderStyle,
      }}
      title={def.name}
    >
      {/* 96×96 图标区：未来放真实勋章图片，现在先居中放大 emoji */}
      <div
        style={{
          width: 96,
          height: 96,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 60,
          lineHeight: 1,
        }}
      >
        {def.emoji}
      </div>
      <div style={{ fontSize: 14, marginTop: 8, fontWeight: 600 }}>{def.name}</div>
      {!unlocked && <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{progressText(def, current)}</div>}
    </div>
  )
}
