import { useEffect, useState } from 'react'
import { TumblingE } from '../../training/TumblingE'
import type { StageProps } from '../types'

/**
 * 太空射击皮肤：中央一个「敌人」飞碟，视标 E 清晰地印在它中心（读 E = 判断敌人朝向）。
 * 答对 → 战机射激光击中敌人爆炸；答错 → 战机闪、屏幕红一下；翻拍 → 星空加速跃迁。
 * E 是敌人的要害标记，读方向就是瞄准、答对就是击落——飞船/E/敌人三者合一。
 * 纯 DOM/CSS/SVG，emoji 占位（后续换 AI 出图）。
 */
export function SpaceStage({ target, heightPx, phase, lastAnswer, isEgg }: StageProps) {
  const [fx, setFx] = useState<{ correct: boolean; key: number } | null>(null)

  useEffect(() => {
    if (!lastAnswer) return
    setFx({ correct: lastAnswer.correct, key: lastAnswer.seq })
    const t = window.setTimeout(() => setFx(null), 600)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAnswer?.seq])

  const transitioning = phase === 'transitioning'
  const enemySize = Math.max(88, heightPx * 2.4)
  const hit = fx?.correct === true
  const miss = fx?.correct === false

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
          animation: transitioning ? 'fzpStar 0.4s linear infinite' : 'none',
          opacity: 0.85,
        }}
      />

      {/* 答错：屏幕红闪 */}
      {miss && <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,60,60,0.18)', animation: 'fzpFade 0.4s ease-out' }} />}

      {/* 中央敌人（视标 E 印在它中心）——showing 且未被击碎时显示 */}
      {phase === 'showing' && target && !hit && (
        <div
          style={{
            position: 'absolute',
            top: '42%',
            left: '50%',
            width: enemySize,
            height: enemySize,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            background: isEgg ? 'radial-gradient(circle, #6a5410, #2a2205)' : 'radial-gradient(circle, #3a2a5a, #170f2e)',
            border: isEgg ? '3px solid gold' : '3px solid #7a6ad8',
            boxShadow: isEgg ? '0 0 22px 6px rgba(255,215,0,0.6)' : '0 0 18px 4px rgba(122,106,216,0.5)',
            animation: miss ? 'fzpShake 0.3s' : 'fzpFloat 2.4s ease-in-out infinite',
          }}
        >
          <span style={{ color: '#f2f6ff' }}>
            <TumblingE direction={target} heightPx={heightPx} />
          </span>
          {isEgg && <div style={{ position: 'absolute', top: -12, fontSize: 22 }}>✨</div>}
        </div>
      )}

      {/* 翻拍过渡：下一波来袭 */}
      {transitioning && !hit && (
        <div style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%,-50%)', color: '#8fdfff', fontSize: 18 }}>
          下一波来袭…
        </div>
      )}

      {/* 答对：激光 + 爆炸（在敌人位置） */}
      {hit && (
        <div key={`laser${fx!.key}`} style={{ position: 'absolute', bottom: '13%', left: '50%', width: 5, height: '42%', background: 'linear-gradient(#ffffff, #44ddff)', transform: 'translateX(-50%)', animation: 'fzpLaser 0.3s ease-out', borderRadius: 3 }} />
      )}
      {hit && (
        <div key={`boom${fx!.key}`} style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 52, animation: 'fzpBoom 0.5s ease-out' }}>
          💥
        </div>
      )}

      {/* 战机 */}
      <div style={{ position: 'absolute', bottom: '3%', left: '50%', transform: 'translateX(-50%)', fontSize: 36, animation: miss ? 'fzpShake 0.3s' : 'none' }}>
        🚀
      </div>

      <style>{`
        @keyframes fzpStar { from { background-position: 0 0 } to { background-position: 0 40px } }
        @keyframes fzpFloat { 0%,100% { transform: translate(-50%,-50%) } 50% { transform: translate(-50%,-58%) } }
        @keyframes fzpShake { 0%,100% { transform: translate(-50%,-50%) } 25% { transform: translate(-58%,-50%) rotate(-6deg) } 75% { transform: translate(-42%,-50%) rotate(6deg) } }
        @keyframes fzpLaser { 0% { opacity: 1; height: 0 } 55% { height: 42% } 100% { opacity: 0 } }
        @keyframes fzpBoom { 0% { transform: translate(-50%,-50%) scale(0.3); opacity: 1 } 100% { transform: translate(-50%,-50%) scale(1.9); opacity: 0 } }
        @keyframes fzpFade { from { opacity: 1 } to { opacity: 0 } }
        @keyframes fzpBlurIn { from { filter: blur(8px); opacity: 0.2 } to { filter: blur(0); opacity: 1 } }
      `}</style>
    </div>
  )
}
