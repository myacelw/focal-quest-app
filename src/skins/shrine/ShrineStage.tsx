import { useEffect, useState } from 'react'
import { TumblingE } from '../../training/TumblingE'
import type { StageProps } from '../types'

/**
 * 神庙勇者皮肤（塞尔达风，像素艺术）：古神庙里火焰骷髅守护者的核心符文（视标 E）指示弱点。
 * 念对 → 勇者挥剑光击碎守护者 → 光之精灵 +1（10 精灵点亮一座神庙）；答错 → 守护者红光震荡。
 * 素材 ansimuz CC0（Gothicvania），见 public/skins/shrine/CREDITS.md。
 */
/** 守护者（怪兽）池：每题轮换一只，E 始终印在核心深色圆底上（铁律：看清优先）。
 *  sprite=CC0 精灵图（有质感）；emoji=占位大怪兽（真图渐进替换）。加怪兽只需 push 进池。 */
type Guardian =
  | { kind: 'sprite'; src: string; frames: number; name: string }
  | { kind: 'emoji'; char: string; name: string }

const GUARDIANS: Guardian[] = [
  { kind: 'sprite', src: '/skins/shrine/guardian-strip8.png', frames: 8, name: '火焰骷髅' },
  { kind: 'emoji', char: '🐉', name: '青焰龙' },
  { kind: 'emoji', char: '👹', name: '赤角鬼' },
  { kind: 'emoji', char: '🗿', name: '远古像' },
  { kind: 'emoji', char: '👾', name: '虚空魔' },
  { kind: 'emoji', char: '🦂', name: '毒尾蝎' },
]

/** 第 seq 道视标（0-based，= 已答题数）对应的守护者，循环轮换整个池。 */
export function guardianForSeq(seq: number): Guardian {
  const n = GUARDIANS.length
  return GUARDIANS[((seq % n) + n) % n]
}

/** 勇者（下方角色）。换林克/四英杰只需替换这两张精灵图，或扩成英雄池按需切换。 */
const HERO = {
  idle: '/skins/shrine/hero-idle-strip4.png',
  attack: '/skins/shrine/hero-attack-strip6.png',
}

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

  const guardian = guardianForSeq(lastAnswer?.seq ?? 0)
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

      {/* 守护者（每题轮换）+ 核心符文 E */}
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
          {guardian.kind === 'sprite' ? (
            <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${guardian.src})`, backgroundRepeat: 'no-repeat', animation: `fzpGuardian 0.9s steps(${guardian.frames}) infinite` }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 150, lineHeight: 1, filter: 'drop-shadow(0 0 10px rgba(140,50,10,0.85))' }}>
              {guardian.char}
            </div>
          )}
          {/* 怪兽名牌，强化"每题变形"的代入感 */}
          <div style={{ position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)', fontSize: 11, letterSpacing: 1, color: '#ffd9a0', whiteSpace: 'nowrap', textShadow: '0 0 4px #000' }}>{guardian.name}</div>
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
          backgroundImage: hit ? `url(${HERO.attack})` : `url(${HERO.idle})`,
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
