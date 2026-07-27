import { describe, it, expect } from 'vitest'
import { makeUtteranceGate } from './utterance-gate'

/**
 * 这个闸门是「语音答题提速」的关键：改成听 partial 后延迟能从约 1 秒降到说出词的瞬间，
 * 但 partial 会连续吐同一句，不去重就会一次发声连答好几题（孩子说一个「上」，
 * 结果连答三题、其中两题必然算错）。下面的用例锁住这条线。
 */
describe('makeUtteranceGate', () => {
  it('一次发声只放行一次——连续 partial 只有第一条被接受', () => {
    const g = makeUtteranceGate()
    expect(g.onPartial('上')).toBe('上')
    expect(g.onPartial('上')).toBeNull()
    expect(g.onPartial('上')).toBeNull()
  })

  it('final 到来后重置，下一次发声能重新放行', () => {
    const g = makeUtteranceGate()
    expect(g.onPartial('上')).toBe('上')
    expect(g.onFinal('上')).toBeNull() // partial 已放行，final 不重复触发
    expect(g.onPartial('下')).toBe('下') // 新一轮
  })

  it('partial 没识别出来时由 final 兜底（不能因为提速就丢答案）', () => {
    const g = makeUtteranceGate()
    expect(g.onFinal('左')).toBe('左')
  })

  it('空 partial 与空 final 都忽略，且空 final 不消耗本轮', () => {
    const g = makeUtteranceGate()
    expect(g.onPartial('')).toBeNull()
    expect(g.onPartial('   ')).toBeNull()
    expect(g.onFinal('')).toBeNull()
    // 上面都没放行过，这次 partial 应该能正常放行
    expect(g.onPartial('右')).toBe('右')
  })

  it('去掉首尾空白（vosk 的 partial 常带空格）', () => {
    const g = makeUtteranceGate()
    expect(g.onPartial('  上  ')).toBe('上')
  })

  it('连续多轮发声互不干扰', () => {
    const g = makeUtteranceGate()
    const said: (string | null)[] = []
    for (const word of ['上', '下', '左', '右']) {
      said.push(g.onPartial(word))
      g.onPartial(word) // 重复 partial
      g.onFinal(word)   // 收尾
    }
    expect(said).toEqual(['上', '下', '左', '右'])
  })

  it('空 final 也会重置本轮（否则一次识别失败会永久卡住后续答题）', () => {
    const g = makeUtteranceGate()
    expect(g.onPartial('上')).toBe('上')
    expect(g.onFinal('')).toBeNull() // 识别最终为空
    expect(g.onPartial('下')).toBe('下') // 必须能继续答题
  })
})
