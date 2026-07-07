import { TumblingE } from '../training/TumblingE'
import type { StageProps } from './types'

/** 朴素皮肤：复刻原训练页的视标舞台；彩蛋时视标外加金光 */
export function PlainStage({ target, heightPx, phase, isEgg }: StageProps) {
  if (phase === 'transitioning') {
    return <div style={{ fontSize: 24, color: '#1d9e75' }}>翻！</div>
  }
  if (!target) return null
  return (
    <div
      style={{
        position: 'relative',
        animation: 'fzpBlurIn 0.4s ease-out',
        color: '#111',
        padding: 16,
        borderRadius: 16,
        boxShadow: isEgg ? '0 0 0 4px gold, 0 0 24px 6px rgba(255,215,0,0.6)' : 'none',
        background: isEgg ? 'radial-gradient(circle, #fffbe6, transparent 70%)' : 'transparent',
      }}
    >
      {isEgg && <div style={{ position: 'absolute', top: -6, right: -6, fontSize: 24 }}>✨</div>}
      <TumblingE direction={target} heightPx={heightPx} />
      <style>{`@keyframes fzpBlurIn { from { filter: blur(8px); opacity: 0.2 } to { filter: blur(0); opacity: 1 } }`}</style>
    </div>
  )
}
