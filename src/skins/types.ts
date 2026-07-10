import type { FC } from 'react'
import type { Direction } from '../speech/answer-mapping'

/** 皮肤舞台组件的 props：训练页把当前视标状态和最近作答传给皮肤，皮肤自渲染背景+视标+演出 */
export interface StageProps {
  target: Direction | null
  heightPx: number
  phase: 'showing' | 'transitioning'
  /** 最近一次作答；seq 递增用于触发一次性演出动画 */
  lastAnswer: { dir: Direction; correct: boolean; seq: number } | null
  /** 当前视标是否彩蛋（连续答对触发的惊喜） */
  isEgg: boolean
  /** 已捕获的本世界储备怪兽 id 列表（如 'space-comet_rider'），用于扩展训练轮换池；plain 皮肤不使用 */
  capturedReserveIds?: string[]
}

export interface Skin {
  id: string
  name: string
  Stage: FC<StageProps>
}
