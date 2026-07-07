import { TumblingE } from '../training/TumblingE'
import type { StageProps } from './types'

/** 朴素皮肤：复刻原训练页的视标舞台（翻拍时"翻！"，否则模糊→清晰的 E） */
export function PlainStage({ target, heightPx, phase }: StageProps) {
  if (phase === 'transitioning') {
    return <div style={{ fontSize: 24, color: '#1d9e75' }}>翻！</div>
  }
  if (!target) return null
  return (
    <div style={{ animation: 'fzpBlurIn 0.4s ease-out', color: '#111' }}>
      <TumblingE direction={target} heightPx={heightPx} />
      <style>{`@keyframes fzpBlurIn { from { filter: blur(8px); opacity: 0.2 } to { filter: blur(0); opacity: 1 } }`}</style>
    </div>
  )
}
