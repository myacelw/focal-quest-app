import { useEffect, useState, type CSSProperties } from 'react'
import { TumblingE } from '../../training/TumblingE'
import type { StageProps } from '../types'
import type { Direction } from '../../speech/answer-mapping'

/** 四方向陨石/爆炸的定位（容器内绝对定位，粗略贴四边中点） */
const POS: Record<Direction, CSSProperties> = {
  up: { top: '4%', left: '43%' },
  down: { bottom: '16%', left: '43%' },
  left: { left: '3%', top: '40%' },
  right: { right: '3%', top: '40%' },
}
/** 激光从战机（底部中央）指向各方向的旋转角 */
const LASER_ROT: Record<Direction, number> = { up: 0, down: 180, left: -90, right: 90 }

/**
 * 太空射击皮肤：星空背景 + 底部战机 + 四方向陨石 + 居中视标。
 * 答对 → 激光射向该方向 + 陨石爆炸；答错 → 战机抖动；翻拍 → 星空加速 + 跃迁提示。
 * 纯 DOM/CSS/SVG，emoji 占位（后续换 AI 出图）。
 */
export function SpaceStage({ target, heightPx, phase, lastAnswer, isEgg }: StageProps) {
  const [fx, setFx] = useState<{ dir: Direction; correct: boolean; key: number } | null>(null)

  useEffect(() => {
    if (!lastAnswer) return
    setFx({ dir: lastAnswer.dir, correct: lastAnswer.correct, key: lastAnswer.seq })
    const t = window.setTimeout(() => setFx(null), 600)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAnswer?.seq])

  const transitioning = phase === 'transitioning'

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 420,
        aspectRatio: '1 / 1',
        margin: '0 auto',
        borderRadius: 16,
        overflow: 'hidden',
        background: 'radial-gradient(circle at 50% 45%, #1b2650, #070a16)',
      }}
    >
      {/* 星空 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 70% 60%, #cfe, transparent), radial-gradient(1px 1px at 40% 80%, #fff, transparent), radial-gradient(1px 1px at 85% 20%, #9bf, transparent)',
          animation: transitioning ? 'fzpStar 0.5s linear infinite' : 'none',
          opacity: 0.85,
        }}
      />

      {/* 四方向陨石（被击中的那颗淡出） */}
      {(['up', 'down', 'left', 'right'] as Direction[]).map((d) => (
        <div
          key={d}
          style={{
            position: 'absolute',
            fontSize: 32,
            ...POS[d],
            opacity: fx?.correct && fx.dir === d ? 0 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          🪨
        </div>
      ))}

      {/* 视标居中（看清优先，演出在四周） */}
      <div style={{ position: 'absolute', top: '44%', left: '50%', transform: 'translate(-50%,-50%)' }}>
        {transitioning ? (
          <span style={{ color: '#8fdfff', fontSize: 20 }}>跃迁中…</span>
        ) : target ? (
          <div
            style={{
              position: 'relative',
              color: '#eaf2ff',
              animation: 'fzpBlurIn 0.4s ease-out',
              padding: 12,
              borderRadius: 14,
              boxShadow: isEgg ? '0 0 0 3px gold, 0 0 22px 5px rgba(255,215,0,0.7)' : 'none',
            }}
          >
            {isEgg && <div style={{ position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)', fontSize: 22 }}>💎</div>}
            <TumblingE direction={target} heightPx={heightPx} />
          </div>
        ) : null}
      </div>

      {/* 战机 */}
      <div
        style={{
          position: 'absolute',
          bottom: '2%',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 34,
          animation: fx && !fx.correct ? 'fzpShake 0.3s' : 'none',
        }}
      >
        🚀
      </div>

      {/* 激光（答对） */}
      {fx?.correct && (
        <div
          key={fx.key}
          style={{
            position: 'absolute',
            bottom: '10%',
            left: '50%',
            width: 4,
            height: '42%',
            background: 'linear-gradient(#ffffff, #44ddff)',
            transformOrigin: 'bottom center',
            transform: `translateX(-50%) rotate(${LASER_ROT[fx.dir]}deg)`,
            animation: 'fzpLaser 0.35s ease-out',
            borderRadius: 2,
          }}
        />
      )}
      {/* 爆炸（答对，命中陨石处） */}
      {fx?.correct && (
        <div key={`b${fx.key}`} style={{ position: 'absolute', fontSize: 34, ...POS[fx.dir], animation: 'fzpBoom 0.5s ease-out' }}>
          💥
        </div>
      )}

      <style>{`
        @keyframes fzpStar { from { background-position: 0 0 } to { background-position: 0 40px } }
        @keyframes fzpLaser { 0% { opacity: 1; height: 0 } 45% { height: 42% } 100% { opacity: 0 } }
        @keyframes fzpBoom { 0% { transform: scale(0.2); opacity: 1 } 100% { transform: scale(1.7); opacity: 0 } }
        @keyframes fzpShake { 0%,100% { transform: translateX(-50%) } 25% { transform: translateX(-62%) rotate(-8deg) } 75% { transform: translateX(-38%) rotate(8deg) } }
        @keyframes fzpBlurIn { from { filter: blur(8px); opacity: 0.2 } to { filter: blur(0); opacity: 1 } }
      `}</style>
    </div>
  )
}
