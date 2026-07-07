import { TumblingE } from '../../training/TumblingE'
import type { StageProps } from '../types'

/**
 * 太空射击皮肤（占位）。Task3 补星空/战机/四方向陨石，Task4 补答对激光爆炸/答错闪/翻拍星流。
 * 现阶段：深色太空背景 + 居中视标，能验证换肤切换生效。
 */
export function SpaceStage({ target, heightPx, phase }: StageProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: 240,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 40%, #1a2340, #0a0e1a)',
        borderRadius: 12,
      }}
    >
      {phase === 'transitioning' ? (
        <div style={{ fontSize: 20, color: '#8fdfff' }}>跃迁中…</div>
      ) : target ? (
        <div style={{ color: '#ffffff' }}>
          <TumblingE direction={target} heightPx={heightPx} />
        </div>
      ) : null}
    </div>
  )
}
