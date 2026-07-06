import type { Direction } from '../speech/answer-mapping'

/** Tumbling E 开口朝向 → 旋转角度（基准 E 开口朝右 = 0°，顺时针） */
export function directionToRotation(dir: Direction): number {
  switch (dir) {
    case 'right': return 0
    case 'down': return 90
    case 'left': return 180
    case 'up': return 270
  }
}

/**
 * 标准 5×5 网格 Tumbling E（基准开口朝右），按 heightPx 显示、按方向旋转。
 * 颜色继承 currentColor。
 */
export function TumblingE({ direction, heightPx }: { direction: Direction; heightPx: number }) {
  return (
    <svg
      width={heightPx}
      height={heightPx}
      viewBox="0 0 5 5"
      role="img"
      aria-label={`视标 E 朝${direction}`}
      style={{ transform: `rotate(${directionToRotation(direction)}deg)`, color: 'inherit' }}
    >
      <g fill="currentColor">
        <rect x="0" y="0" width="5" height="1" />
        <rect x="0" y="2" width="4" height="1" />
        <rect x="0" y="4" width="5" height="1" />
        <rect x="0" y="0" width="1" height="5" />
      </g>
    </svg>
  )
}
