import { useEffect, useState } from 'react'
import { TumblingE } from '../../training/TumblingE'
import type { StageProps } from '../types'
import { asset } from '../../data/asset'
import { useT } from '../../i18n'
import { reserveMonstersOfWorld } from '../../dex/monster-defs'

/**
 * 太空射击皮肤（真素材版）：NASA 星云背景 + Unlucky Studio CC0 战机/敌舰/爆炸帧
 * + Gemini AI 生成的 5 只敌人（4×4 网格一次出图，见 docs/怪兽出图提示词.md）。
 * 视标 E 印在敌舰核心上（读 E = 判断弱点相位）。
 * 答对 → 激光命中 → 爆炸序列帧；答错 → 红闪 + 战机抖；翻拍 → 跃迁速线。
 * 素材来源见 public/skins/space/CREDITS.md。
 */
/** 敌人池：每题轮换一个承载视标 E，全部为静态图（无动画帧）。
 *  name 是翻译 key 的 slug（对应 i18n 的 space.enemy.<name>），非展示文本。 */
type Enemy = { kind: 'img'; src: string; name: string }

/** 现役基础池（6 只现役，与图鉴 monster-defs 的现役 id 对齐） */
const BASE_ENEMIES: Enemy[] = [
  { kind: 'img', src: asset('/skins/space/enemy.png'), name: 'enemy' },
  { kind: 'img', src: asset('/skins/space/ufo.webp'), name: 'ufo' },
  { kind: 'img', src: asset('/skins/space/alien.webp'), name: 'alien' },
  { kind: 'img', src: asset('/skins/space/meteor.webp'), name: 'meteor' },
  { kind: 'img', src: asset('/skins/space/sentinel.webp'), name: 'sentinel' },
  { kind: 'img', src: asset('/skins/space/darkring.webp'), name: 'darkring' },
]

/** 储备敌池：由图鉴定义派生（rare+epic 共 11 只），按 id 排序保持稳定；
 *  仅当孩子已捕获对应怪兽时，对应项才进入实际轮换池。 */
const RESERVE_ENEMIES: Enemy[] = reserveMonstersOfWorld('space').map((m) => ({
  kind: 'img' as const,
  src: m.img,
  // monster-defs 的 id 是 'space-<slug>'，这里取 slug 复用 space.enemy.<slug> 翻译
  name: m.id.replace('space-', ''),
}))

/** 实际轮换池 = 基础池 + 已捕获的本世界储备怪 */
export function buildEnemyPool(capturedReserveIds: string[] = []): Enemy[] {
  const extra = RESERVE_ENEMIES.filter((e) => capturedReserveIds.includes(`space-${e.name}`))
  return [...BASE_ENEMIES, ...extra]
}

/** 第 seq 道视标（=已答题数）对应的敌人，循环轮换整个池。
 *  不传 capturedReserveIds 时回退基础池（向后兼容现有单测）。 */
export function enemyForSeq(seq: number, capturedReserveIds?: string[]): Enemy {
  const pool = buildEnemyPool(capturedReserveIds)
  const n = pool.length
  return pool[((seq % n) + n) % n]
}

export function SpaceStage({ target, heightPx, phase, lastAnswer, isEgg, capturedReserveIds }: StageProps) {
  const t = useT()
  const [fx, setFx] = useState<{ correct: boolean; key: number } | null>(null)

  useEffect(() => {
    if (!lastAnswer) return
    setFx({ correct: lastAnswer.correct, key: lastAnswer.seq })
    const timer = window.setTimeout(() => setFx(null), 700)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAnswer?.seq])

  const transitioning = phase === 'transitioning'
  const enemySize = Math.max(120, heightPx * 2.6)
  const enemy = enemyForSeq(lastAnswer?.seq ?? 0, capturedReserveIds)
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
        background: `url(${asset('/skins/space/bg-nebula.jpg')}) center / cover, #070a16`,
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
          <img src={enemy.src} alt="" width={enemySize} height={enemySize} style={{ display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#ffffff', filter: 'drop-shadow(0 0 3px #000) drop-shadow(0 0 1px #000)' }}>
              <TumblingE direction={target} heightPx={heightPx} />
            </span>
          </div>
          <div style={{ position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)', fontSize: 11, letterSpacing: 1, color: '#bfe4ff', whiteSpace: 'nowrap', textShadow: '0 0 4px #001' }}>{t(`space.enemy.${enemy.name}`)}</div>
          {isEgg && <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', fontSize: 20 }}>✨</div>}
        </div>
      )}

      {/* 翻拍提示 */}
      {transitioning && !hit && (
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', color: '#9fdcff', fontSize: 16, textShadow: '0 0 8px #001' }}>
          {t('space.nextWave')}
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
            backgroundImage: `url(${asset('/skins/space/explosion-strip9.png')})`,
            backgroundRepeat: 'no-repeat',
            animation: 'fzpBoomStrip 0.55s steps(9) forwards',
            transform: 'scale(1.4)',
          }}
        />
      )}

      {/* 战机：两帧引擎火焰交替 */}
      <div style={{ position: 'absolute', bottom: '2%', left: '50%', width: 72, height: 72, transform: 'translateX(-50%)', animation: miss ? 'fzpShakeShip 0.3s' : 'none' }}>
        <img src={asset('/skins/space/ship-1.png')} alt="" width={72} height={72} style={{ position: 'absolute', inset: 0 }} />
        <img src={asset('/skins/space/ship-2.png')} alt="" width={72} height={72} style={{ position: 'absolute', inset: 0, animation: 'fzpEngine 0.32s steps(1) infinite' }} />
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
