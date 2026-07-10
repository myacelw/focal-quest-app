import type { MonsterDef } from './monster-defs'

/**
 * 图鉴/开箱里的怪兽视觉：填满父容器。
 * - 普通静态图：<img objectFit:contain>
 * - 精灵条素材（sprite）：用 background 只取第 0 帧，避免整条 8 帧胶片被拉伸成连环画。
 * 父容器负责尺寸/圆角/裁剪；filter 用于未捕获剪影（brightness(0)）。
 */
export function MonsterImage({ def, filter }: { def: MonsterDef; filter?: string }) {
  if (def.sprite) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundImage: `url(${def.img})`,
          backgroundSize: `${def.sprite.frames * 100}% 100%`,
          backgroundPosition: '0 0',
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          filter,
        }}
      />
    )
  }
  return (
    <img
      src={def.img}
      alt=""
      style={{ width: '100%', height: '100%', objectFit: 'contain', filter }}
    />
  )
}
