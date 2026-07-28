import { useEffect, useState } from 'react'
import { TumblingE } from '../../training/TumblingE'
import type { StageProps } from '../types'
import { asset } from '../../data/asset'
import { useT } from '../../i18n'
import { reserveMonstersOfWorld } from '../../dex/monster-defs'
import { buildRotationPool, pickForSeq } from '../rotation'

/**
 * 魔法森林皮肤（柔和插画风，与积分卡册同源）：古树林里的森林精灵承载视标 E。
 * 念对 → 光点爆散 + 花瓣飞舞，叶片 +1（10 片点亮一棵古树）；答错 → 精灵抖动 + 暗闪。
 *
 * 结构照 ShrineStage：精灵每题轮换、E 印在深色圆底上。刻意**不做**下方的动画角色——
 * 逐帧精灵图 AI 生成不了、要找 CC0 素材，而它对训练体验贡献很小。
 */
/** 精灵池：每题轮换一只承载视标 E，全部为静态图。
 *  name 是翻译 key 的 slug（对应 i18n 的 forest.spirit.<name>），非展示文本。 */
type Spirit = { kind: 'img'; src: string; name: string }

/** 基础池（6 只 common，与图鉴 monster-defs 的 FOREST_COMMON 对齐） */
const BASE_SPIRITS: Spirit[] = [
  { kind: 'img', src: asset('/skins/forest/sprout.webp'), name: 'sprout' },
  { kind: 'img', src: asset('/skins/forest/mushroom.webp'), name: 'mushroom' },
  { kind: 'img', src: asset('/skins/forest/firefly.webp'), name: 'firefly' },
  { kind: 'img', src: asset('/skins/forest/acorn.webp'), name: 'acorn' },
  { kind: 'img', src: asset('/skins/forest/fawn.webp'), name: 'fawn' },
  { kind: 'img', src: asset('/skins/forest/bluebird.webp'), name: 'bluebird' },
]

/** 储备精灵池：由图鉴定义派生（rare+epic 共 10 只），按 id 排序保持稳定；
 *  仅当孩子已捕获对应怪兽时，对应项才进入实际轮换池。 */
const RESERVE_SPIRITS: Spirit[] = reserveMonstersOfWorld('forest').map((m) => ({
  kind: 'img' as const,
  src: m.img,
  name: m.id.replace('forest-', ''),
}))

/** 实际轮换池 = 基础池 + 已捕获的本世界储备精灵（逻辑与太空/神庙共用，见 ../rotation） */
export function buildSpiritPool(capturedReserveIds: string[] = []): Spirit[] {
  return buildRotationPool(BASE_SPIRITS, RESERVE_SPIRITS, 'forest', capturedReserveIds)
}

/** 第 seq 道视标（0-based，= 已答题数）对应的精灵，循环轮换整个池。 */
export function spiritForSeq(seq: number, capturedReserveIds?: string[]): Spirit {
  return pickForSeq(buildSpiritPool(capturedReserveIds), seq)
}

export function ForestStage({ target, heightPx, phase, lastAnswer, isEgg, capturedReserveIds }: StageProps) {
  const t = useT()
  const [fx, setFx] = useState<{ correct: boolean; key: number } | null>(null)
  const [leaves, setLeaves] = useState(0)
  const [trees, setTrees] = useState(1)

  useEffect(() => {
    if (!lastAnswer) return
    setFx({ correct: lastAnswer.correct, key: lastAnswer.seq })
    if (lastAnswer.correct) {
      // 不在 updater 里嵌套 setState——StrictMode 下 updater 会被调两次，
      // 嵌套的 setTrees 会跟着多跑一次，导致计数偶尔跳 2。
      const next = leaves + 1
      if (next >= 10) { setLeaves(0); setTrees((s) => s + 1) } else { setLeaves(next) }
    }
    const timer = window.setTimeout(() => setFx(null), 800)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAnswer?.seq])

  const spirit = spiritForSeq(lastAnswer?.seq ?? 0, capturedReserveIds)
  const transitioning = phase === 'transitioning'
  const hit = fx?.correct === true
  const miss = fx?.correct === false

  return (
    <div
      className="fzp-skin-canvas"
      style={{ background: `url(${asset('/skins/forest/bg.webp')}) center / cover, #16281c` }}
    >
      {/* 林间柔光 */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 30%, rgba(214,255,180,0.18), rgba(10,26,16,0.45) 78%)' }} />

      {/* 计数 */}
      <div style={{ position: 'absolute', top: '2.4cqmin', left: '2.9cqmin', fontSize: 'max(9px, 2.9cqmin)', background: 'rgba(0,0,0,0.42)', border: '1px solid #4e8a55', borderRadius: 99, padding: '3px 12px', color: '#dcffd0', zIndex: 5 }}>
        {t('forest.counter', { leaves, trees })}
      </div>

      {/* 答错暗闪 */}
      {miss && <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,10,0,0.22)', animation: 'fzpFade 0.4s ease-out', zIndex: 4 }} />}

      {/* 精灵（每题轮换）+ 视标 E。
          ⚠️ 祖先链上不许出现 transform: scale —— 那会等比缩掉视标，等于换皮肤就偷偷
          改训练强度（神庙曾因 scale(0.8) 让 E 只有标定值的 80%）。要缩就折进 width/height。 */}
      {phase === 'showing' && target && !hit && (
        <div
          style={{
            position: 'absolute',
            top: '36%',
            left: '50%',
            width: '37cqmin',
            height: '43cqmin',
            transform: 'translate(-50%,-50%)',
            animation: miss ? 'fzpShakeG 0.35s' : 'fzpFloat 2.6s ease-in-out infinite',
            filter: isEgg ? 'drop-shadow(0 0 14px gold)' : 'drop-shadow(0 0 10px rgba(150,255,150,0.45))',
          }}
        >
          <img src={spirit.src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
          {/* 精灵名牌 */}
          <div style={{ position: 'absolute', top: '-6.7cqmin', left: '50%', transform: 'translateX(-50%)', fontSize: 'max(9px, 2.6cqmin)', letterSpacing: 1, color: '#eaffd6', whiteSpace: 'nowrap', textShadow: '0 0 4px #000' }}>{t(`forest.spirit.${spirit.name}`)}</div>
          {/* 视标 E：深色圆底保证对比（铁律：看清优先）。
              ⚠️ padding 跟着 heightPx 走，绝不能换成 cqmin —— 圆底必须与视标同比例。 */}
          <div style={{ position: 'absolute', top: '52%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(0,0,0,0.6)', borderRadius: '50%', padding: Math.max(6, heightPx * 0.4), display: 'flex' }}>
            <span style={{ color: '#ffffff' }}>
              <TumblingE direction={target} heightPx={heightPx} />
            </span>
          </div>
          {isEgg && <div style={{ position: 'absolute', top: '-2.9cqmin', left: '50%', transform: 'translateX(-50%)', fontSize: 'max(14px, 4.8cqmin)' }}>✨</div>}
        </div>
      )}

      {/* 翻拍：藤蔓重织 */}
      {transitioning && !hit && (
        <div style={{ position: 'absolute', top: '36%', left: '50%', transform: 'translate(-50%,-50%)', color: '#bff5a8', fontSize: 'max(12px, 3.8cqmin)', textShadow: '0 0 8px #052', zIndex: 3 }}>
          {t('forest.reweaving')}
        </div>
      )}

      {/* 答对：光点爆散 + 花瓣 + 萤火虫上升 */}
      {hit && (
        <div key={`b${fx!.key}`} style={{ position: 'absolute', top: '36%', left: '50%', width: '45cqmin', height: '45cqmin', transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(226,255,196,0.95), transparent 62%)', animation: 'fzpFade 0.45s 0.1s ease-out forwards', opacity: 0, zIndex: 2 }} />
      )}
      {hit && (
        <div key={`p${fx!.key}`} style={{ position: 'absolute', top: '34%', left: '44%', fontSize: 'max(14px, 5.2cqmin)', animation: 'fzpPetal 0.9s 0.1s ease-out forwards', opacity: 0, zIndex: 4 }}>🌸</div>
      )}
      {hit && (
        <div key={`f${fx!.key}`} style={{ position: 'absolute', top: '36%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 'max(16px, 6.7cqmin)', animation: 'fzpSpirit 0.9s 0.2s ease-out forwards', opacity: 0, zIndex: 4 }}>✨</div>
      )}

      <style>{`
        @keyframes fzpPetal { 0% { opacity: 0 } 25% { opacity: 1 } 100% { opacity: 0; transform: translate(-160%,-120%) rotate(-70deg) } }
        @keyframes fzpFloat { 0%,100% { transform: translate(-50%,-50%) } 50% { transform: translate(-50%,-56%) } }
        @keyframes fzpShakeG { 25% { transform: translate(-56%,-50%) } 75% { transform: translate(-44%,-50%) } }
        @keyframes fzpFade { from { opacity: 1 } to { opacity: 0 } }
        @keyframes fzpSpirit { 0% { opacity: 0 } 25% { opacity: 1 } 100% { opacity: 0; transform: translate(-50%,-190%) scale(1.3) } }
      `}</style>
    </div>
  )
}
