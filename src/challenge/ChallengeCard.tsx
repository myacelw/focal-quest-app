import { useState } from 'react'
import { useT } from '../i18n'
import { readBest } from './challenge-storage'

/**
 * 首页「30 秒挑战」入口卡。**只在解锁时才被 HomePage 渲染**（判定在 HomePage，用
 * challengeUnlocked(stats)）——锁在当天训练之后，挑战才是训练的奖赏而非替代品。
 * 样式沿用首页既有入口卡（图鉴/奖励）那一套 .fq-card + 渐变边框。
 */
export function ChallengeCard({ onOpen }: { onOpen: () => void }) {
  const t = useT()
  const [best] = useState(() => readBest())
  return (
    <button
      onClick={onOpen}
      className="fq-card fq-rise"
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        border: '1.5px solid var(--lemon)',
        background: 'linear-gradient(160deg, #fffaea, #fff)',
        padding: 14, animationDelay: '0.14s',
      }}
    >
      <div style={{ fontSize: 20 }}>⚡</div>
      <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4 }}>{t('challenge.homeCard')}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>{t('challenge.homeCardHint')}</div>
      <div style={{ fontSize: 12, color: 'var(--violet)', fontWeight: 800, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
        {best > 0 ? t('challenge.best', { n: best }) : t('challenge.noBest')}
      </div>
    </button>
  )
}
