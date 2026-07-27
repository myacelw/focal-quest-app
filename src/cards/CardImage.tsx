import { useState } from 'react'
import { cardSheetPos, cardSheetUrl, type CardDef } from './card-defs'

/**
 * 从 4×4 宫格图切一格显示（与 `BadgeCard` 同一套 background-position 约定：
 * backgroundSize 400%，位置按 col/3、row/3 的百分比）。
 *
 * 图缺失时回落到「渐变 + 编号」，两个理由：
 *  ① 正式卡图是后补的美术资源，图还没到之前功能要能完整开发与验收；
 *  ② 线上万一某张 sheet 没进 SW 预缓存，也不该给孩子看一个破图图标。
 * 探测用一个隐藏的 <img onError>，真正显示仍走 background-position 切片。
 */
export function CardImage({ def, size }: { def: CardDef; size: number }) {
  const [failed, setFailed] = useState(false)
  const { row, col } = cardSheetPos(def)
  const url = cardSheetUrl(def)

  if (failed) {
    return (
      <div
        style={{
          width: size, height: size, borderRadius: 12,
          display: 'grid', placeItems: 'center',
          background: 'linear-gradient(135deg, #f4effe, #ffe9f3)',
          color: '#a89adf', fontSize: Math.round(size / 3), fontWeight: 800,
        }}
      >
        {def.id.replace(`${def.setId}-`, '')}
      </div>
    )
  }

  return (
    <>
      <img src={url} alt="" onError={() => setFailed(true)} style={{ display: 'none' }} />
      <div
        style={{
          width: size, height: size, borderRadius: 12,
          backgroundImage: `url(${url})`,
          backgroundSize: '400% 400%',
          backgroundPosition: `${(col / 3) * 100}% ${(row / 3) * 100}%`,
          backgroundRepeat: 'no-repeat',
        }}
      />
    </>
  )
}
