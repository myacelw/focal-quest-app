import { useEffect, useState } from 'react'
import type { MonsterDef } from './monster-defs'

/**
 * 闪光变体的统一处理：加饱和 + 提亮 + 金色描边光。
 *
 * ⚠️ 刻意不用 `hue-rotate`：82 只怪配色各异，同一个色相旋转角度必然在其中
 * 一部分身上产出难看甚至看不清的结果，而且没法逐只调。统一的加亮 + 描边发光
 * 可预期得多，对像素风（神庙）和插画风（太空/森林）都成立。
 */
const SHINY_FILTER = 'saturate(1.35) brightness(1.08) drop-shadow(0 0 5px rgba(255,205,60,0.95))'

/**
 * 图鉴/开箱里的怪兽视觉：填满父容器。
 * - 普通静态图：<img objectFit:contain>
 * - 精灵条素材（sprite）：用 background 只取第 0 帧，避免整条 8 帧胶片被拉伸成连环画。
 * 父容器负责尺寸/圆角/裁剪；filter 用于未捕获剪影（brightness(0)）。
 *
 * 缺图时回落到「渐变 + 🐾」，两个理由：
 *  ① 让 monster def 可以先于美术落地（否则新加的 def 在图鉴里全是破图图标）；
 *  ② 线上万一某张图没进 SW 预缓存，也不该给孩子看破图。
 * 回落刻意不用 '?'——那是"未捕获神秘格"的视觉，两者混淆会让人以为怪没捕到。
 * sprite 分支用 background-image，onError 不会触发，所以两条分支都挂一个隐藏的 <img> 探针。
 */
export function MonsterImage({ def, filter, shiny }: { def: MonsterDef; filter?: string; shiny?: boolean }) {
  const [failed, setFailed] = useState(false)

  // 三个现有调用点都靠 key 或整体卸载隔开不同 def，够不到这个状态复用问题；
  // 但若将来有调用点跨 def 复用同一实例，不复位会让一张缺图把之后所有怪都变成 🐾。
  useEffect(() => setFailed(false), [def.img])

  // 与调用方传入的 filter（未捕获剪影用 brightness(0)）叠加，而不是互相覆盖
  const fx = [shiny ? SHINY_FILTER : '', filter ?? ''].filter(Boolean).join(' ') || undefined

  if (failed) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          background: 'linear-gradient(135deg, #f1ecfb, #e7f3ff)',
          fontSize: '2em',
          filter: fx,
        }}
      >
        🐾
      </div>
    )
  }

  if (def.sprite) {
    // sprite 分支用 background-image，onError 不会触发，所以挂一个隐藏的 <img> 探针。
    const probe = <img src={def.img} alt="" onError={() => setFailed(true)} style={{ display: 'none' }} />
    return (
      <>
        {probe}
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundImage: `url(${def.img})`,
            backgroundSize: `${def.sprite.frames * 100}% 100%`,
            backgroundPosition: '0 0',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
            filter: fx,
          }}
        />
      </>
    )
  }

  return (
    <img
      src={def.img}
      alt=""
      onError={() => setFailed(true)}
      style={{ width: '100%', height: '100%', objectFit: 'contain', filter: fx }}
    />
  )
}
