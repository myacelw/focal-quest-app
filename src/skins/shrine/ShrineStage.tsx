import { useEffect, useState } from 'react'
import { TumblingE } from '../../training/TumblingE'
import type { StageProps } from '../types'

/**
 * 神庙勇者皮肤（塞尔达风，像素艺术）：古神庙里火焰骷髅守护者的核心符文（视标 E）指示弱点。
 * 念对 → 勇者挥剑光击碎守护者 → 光之精灵 +1（10 精灵点亮一座神庙）；答错 → 守护者红光震荡。
 * 素材 ansimuz CC0（Gothicvania），见 public/skins/shrine/CREDITS.md。
 */
export function ShrineStage({ target, heightPx, phase, lastAnswer, isEgg }: StageProps) {
  const [fx, setFx] = useState<{ correct: boolean; key: number } | null>(null)
  const [spirits, setSpirits] = useState(0)
  const [shrines, setShrines] = useState(1)

  useEffect(() => {
    if (!lastAnswer) return
    setFx({ correct: lastAnswer.correct, key: lastAnswer.seq })
    if (lastAnswer.correct) {
      setSpirits((n) => {
        if (n + 1 >= 10) { setShrines((s) => s + 1); return 0 }
        return n + 1
      })
    }
    const t = window.setTimeout(() => setFx(null), 800)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAnswer?.seq])

  const transitioning = phase === 'transitioning'
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
        background: 'url(/skins/shrine/bg.png) center / cover, #0b1a18',
        imageRendering: 'pixelated',
      }}
    >
      {/* 暗化 + 神庙青绿氛围光 */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 42%, rgba(90,216,176,0.10), rgba(4,10,9,0.5) 75%)' }} />

      {/* 计数 */}
      <div style={{ position: 'absolute', top: 10, left: 12, fontSize: 12, background: 'rgba(0,0,0,0.5)', border: '1px solid #2f6b5c', borderRadius: 99, padding: '3px 12px', color: '#c2ffe9', zIndex: 5 }}>
        ✨ 精灵 {spirits}/10 · ⛩️ 神庙 {shrines}
      </div>

      {/* 答错红闪 */}
      {miss && <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,70,70,0.18)', animation: 'fzpFade 0.4s ease-out', zIndex: 4 }} />}

      {/* 守护者火焰骷髅（8 帧循环）+ 核心符文 E */}
      {phase === 'showing' && target && !hit && (
        <div
          style={{
            position: 'absolute',
            top: '36%',
            left: '50%',
            width: 192,
            height: 224,
            transform: 'translate(-50%,-50%) scale(0.8)',
            animation: miss ? 'fzpShakeG 0.35s' : 'fzpFloat 2.6s ease-in-out infinite',
            filter: isEgg ? 'drop-shadow(0 0 14px gold)' : 'drop-shadow(0 0 10px rgba(255,120,40,0.5))',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/skins/shrine/guardian-strip8.png)', backgroundRepeat: 'no-repeat', animation: 'fzpGuardian 0.9s steps(8) infinite' }} />
          {/* 符文 E：深色圆底保证对比（铁律一：看清优先） */}
          <div style={{ position: 'absolute', top: '52%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(0,0,0,0.6)', borderRadius: '50%', padding: Math.max(6, heightPx * 0.4), display: 'flex' }}>
            <span style={{ color: '#ffffff' }}>
              <TumblingE direction={target} heightPx={heightPx} />
            </span>
          </div>
          {isEgg && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', fontSize: 20 }}>✨</div>}
        </div>
      )}

      {/* 翻拍：符文重组 */}
      {transitioning && !hit && (
        <div style={{ position: 'absolute', top: '36%', left: '50%', transform: 'translate(-50%,-50%)', color: '#8fe8c8', fontSize: 16, textShadow: '0 0 8px #031', zIndex: 3 }}>
          符文重组中…
        </div>
      )}

      {/* 答对：剑气光波 + 守护者爆散白闪 + 精灵飞出 */}
      {hit && (
        <div key={`w${fx!.key}`} style={{ position: 'absolute', bottom: '18%', left: '24%', width: '52%', height: 5, background: 'linear-gradient(90deg, #fff, #7dffd4)', transform: 'rotate(-38deg)', transformOrigin: 'left bottom', animation: 'fzpSlash 0.3s ease-out', borderRadius: 3, boxShadow: '0 0 10px #7dffd4', zIndex: 3 }} />
      )}
      {hit && (
        <div key={`x${fx!.key}`} style={{ position: 'absolute', top: '36%', left: '50%', width: 190, height: 190, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(200,255,235,0.95), transparent 60%)', animation: 'fzpFade 0.45s 0.15s ease-out forwards', opacity: 0, zIndex: 2 }} />
      )}
      {hit && (
        <div key={`s${fx!.key}`} style={{ position: 'absolute', top: '36%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 28, animation: 'fzpSpirit 0.9s 0.2s ease-out forwards', opacity: 0, zIndex: 4 }}>
          ✨
        </div>
      )}

      {/* 勇者：idle 循环；答对时播攻击动画 */}
      <div
        style={{
          position: 'absolute',
          bottom: '4%',
          left: hit ? '30%' : '22%',
          width: hit ? 192 : 76,
          height: 96,
          transition: 'left 0.15s',
          backgroundImage: hit ? 'url(/skins/shrine/hero-attack-strip6.png)' : 'url(/skins/shrine/hero-idle-strip4.png)',
          backgroundRepeat: 'no-repeat',
          animation: hit ? 'fzpHeroAtk 0.5s steps(6) forwards' : 'fzpHeroIdle 0.8s steps(4) infinite',
          zIndex: 3,
        }}
      />

      <style>{`
        @keyframes fzpGuardian { from { background-position: 0 0 } to { background-position: -1536px 0 } }
        @keyframes fzpHeroIdle { from { background-position: 0 0 } to { background-position: -304px 0 } }
        @keyframes fzpHeroAtk { from { background-position: 0 0 } to { background-position: -1152px 0 } }
        @keyframes fzpFloat { 0%,100% { transform: translate(-50%,-50%) scale(0.8) } 50% { transform: translate(-50%,-56%) scale(0.8) } }
        @keyframes fzpShakeG { 25% { transform: translate(-56%,-50%) scale(0.8) } 75% { transform: translate(-44%,-50%) scale(0.8) } }
        @keyframes fzpSlash { 0% { opacity: 0; width: 0 } 30% { opacity: 1 } 100% { opacity: 0; width: 52% } }
        @keyframes fzpSpirit { 0% { opacity: 0 } 25% { opacity: 1 } 100% { opacity: 0; transform: translate(-50%,-190%) scale(1.3) } }
        @keyframes fzpFade { from { opacity: 1 } to { opacity: 0 } }
      `}</style>
    </div>
  )
}
