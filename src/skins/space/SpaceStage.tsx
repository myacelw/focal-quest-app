import { useEffect, useState } from 'react'
import { TumblingE } from '../../training/TumblingE'
import type { StageProps } from '../types'

/**
 * 太空射击皮肤（真素材版）：NASA 星云背景 + Unlucky Studio CC0 战机/敌舰/爆炸帧。
 * 视标 E 印在敌舰核心上（读 E = 判断弱点相位）。
 * 答对 → 激光命中 → 爆炸序列帧；答错 → 红闪 + 战机抖；翻拍 → 跃迁速线。
 * 素材来源见 public/skins/space/CREDITS.md。
 */
export function SpaceStage({ target, heightPx, phase, lastAnswer, isEgg }: StageProps) {
  const [fx, setFx] = useState<{ correct: boolean; key: number } | null>(null)

  useEffect(() => {
    if (!lastAnswer) return
    setFx({ correct: lastAnswer.correct, key: lastAnswer.seq })
    const t = window.setTimeout(() => setFx(null), 700)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAnswer?.seq])

  const transitioning = phase === 'transitioning'
  const enemySize = Math.max(120, heightPx * 2.6)
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
        background: 'url(/skins/space/bg-nebula.jpg) center / cover, #070a16',
      }}
    >
      {/* 暗化层：保证视标对比度 */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,6,16,0.42)' }} />

      {/* 翻拍跃迁：速线层 */}
      {transitioning && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'repeating-linear-gradient(180deg, transparent 0 34px, rgba(160,210,255,0.35) 34px 38px)',
            animation: 'fzpWarp 0.35s linear infinite',
            opacity: 0.6,
          }}
        />
      )}

      {/* 答错红闪 */}
      {miss && <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,60,60,0.2)', animation: 'fzpFade 0.4s ease-out' }} />}

      {/* 敌舰（E 印在核心）——showing 且未被击碎时 */}
      {phase === 'showing' && target && !hit && (
        <div
          style={{
            position: 'absolute',
            top: '40%',
            left: '50%',
            width: enemySize,
            height: enemySize,
            transform: 'translate(-50%,-50%)',
            animation: miss ? 'fzpShake 0.3s' : 'fzpFloat 2.8s ease-in-out infinite',
            filter: isEgg ? 'drop-shadow(0 0 14px gold)' : 'none',
          }}
        >
          <img src="/skins/space/enemy.png" alt="" width={enemySize} height={enemySize} style={{ display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#ffffff', filter: 'drop-shadow(0 0 3px #000) drop-shadow(0 0 1px #000)' }}>
              <TumblingE direction={target} heightPx={heightPx} />
            </span>
          </div>
          {isEgg && <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', fontSize: 20 }}>✨</div>}
        </div>
      )}

      {/* 翻拍提示 */}
      {transitioning && !hit && (
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', color: '#9fdcff', fontSize: 16, textShadow: '0 0 8px #001' }}>
          下一波来袭…
        </div>
      )}

      {/* 答对：激光 + 白闪 + 爆炸序列帧 */}
      {hit && (
        <div key={`l${fx!.key}`} style={{ position: 'absolute', bottom: '15%', left: '50%', width: 5, height: '44%', background: 'linear-gradient(#ffffff, #46dcff)', transform: 'translateX(-50%)', animation: 'fzpLaser 0.25s ease-out', borderRadius: 3, boxShadow: '0 0 8px #46dcff' }} />
      )}
      {hit && (
        <div key={`f${fx!.key}`} style={{ position: 'absolute', top: '40%', left: '50%', width: 200, height: 200, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,240,200,0.95), transparent 65%)', animation: 'fzpFade 0.3s ease-out forwards' }} />
      )}
      {hit && (
        <div
          key={`b${fx!.key}`}
          style={{
            position: 'absolute',
            top: '40%',
            left: '50%',
            width: 160,
            height: 160,
            marginLeft: -80,
            marginTop: -80,
            backgroundImage: 'url(/skins/space/explosion-strip9.png)',
            backgroundRepeat: 'no-repeat',
            animation: 'fzpBoomStrip 0.55s steps(9) forwards',
            transform: 'scale(1.4)',
          }}
        />
      )}

      {/* 战机：两帧引擎火焰交替 */}
      <div style={{ position: 'absolute', bottom: '2%', left: '50%', width: 72, height: 72, transform: 'translateX(-50%)', animation: miss ? 'fzpShakeShip 0.3s' : 'none' }}>
        <img src="/skins/space/ship-1.png" alt="" width={72} height={72} style={{ position: 'absolute', inset: 0 }} />
        <img src="/skins/space/ship-2.png" alt="" width={72} height={72} style={{ position: 'absolute', inset: 0, animation: 'fzpEngine 0.32s steps(1) infinite' }} />
      </div>

      <style>{`
        @keyframes fzpFloat { 0%,100% { transform: translate(-50%,-50%) } 50% { transform: translate(-50%,-56%) } }
        @keyframes fzpShake { 25% { transform: translate(-56%,-50%) rotate(-4deg) } 75% { transform: translate(-44%,-50%) rotate(4deg) } }
        @keyframes fzpShakeShip { 25% { transform: translateX(-62%) rotate(-8deg) } 75% { transform: translateX(-38%) rotate(8deg) } }
        @keyframes fzpLaser { 0% { opacity: 1; height: 0 } 60% { height: 44% } 100% { opacity: 0 } }
        @keyframes fzpBoomStrip { from { background-position: 0 0 } to { background-position: -1440px 0 } }
        @keyframes fzpFade { from { opacity: 1 } to { opacity: 0 } }
        @keyframes fzpWarp { from { background-position: 0 0 } to { background-position: 0 38px } }
        @keyframes fzpEngine { 0%,100% { opacity: 0 } 50% { opacity: 1 } }
      `}</style>
    </div>
  )
}
