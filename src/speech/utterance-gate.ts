/**
 * 一次发声只放行一个答案的闸门——把语音答题的延迟从「说完还要等静音判定」压到「说出词的瞬间」。
 *
 * 背景：vosk 的 `result`（最终结果）要等 endpointing（检测到你说完后的静音）才吐出来，
 * 实测约 1 秒。而 `partialresult` 在说话过程中就持续吐当前识别文本。
 *
 * 一般应用不敢用 partial（说到一半可能识别成别的词、后面还会变），但本项目的词表只有
 * 「上/下/左/右」四个词，一旦 partial 里出现某个方向词，答案就已经确定，不存在"说完变成
 * 另一个词"的情况。所以可以在识别到的瞬间就接受。
 *
 * 代价是 partial 会连续吐同一句（"上"→"上"→"上"），必须去重，否则一次发声连答好几题。
 * 这个闸门就管这件事：一次发声（utterance）只放行一次，收到 final 后重置迎接下一次。
 */
export interface UtteranceGate {
  /** 收到 partial 文本。返回要提交给答案解析的文本，null 表示忽略 */
  onPartial: (partial: string) => string | null
  /** 收到 final 文本。返回要提交的文本（partial 已放行过则为 null），并重置本轮 */
  onFinal: (text: string) => string | null
}

export function makeUtteranceGate(): UtteranceGate {
  // 本轮发声是否已经放行过答案。partial 放行后置 true，final 到来时重置。
  let fired = false

  return {
    onPartial(partial: string): string | null {
      const s = (partial ?? '').trim()
      if (s === '') return null
      // 已经放行过就不再放行——partial 会持续吐同一句，不挡住会连答多题
      if (fired) return null
      fired = true
      return s
    },

    onFinal(text: string): string | null {
      const s = (text ?? '').trim()
      const alreadyFired = fired
      // 无论如何都要重置：一句话结束了，下一句要能重新放行
      fired = false
      if (s === '') return null
      // partial 已经放行过这一轮，final 就别重复触发（否则一次发声答两题）
      if (alreadyFired) return null
      // partial 没识别出来、final 才识别出来的情况：由 final 兜底
      return s
    },
  }
}
