import { useEffect, useState } from 'react'

/** 数字从 0 缓动滚到 target（easeOutCubic），用于首页积分/连续天数的"惊艳"入场 */
export function useCountUp(target: number, ms = 750): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (target <= 0) {
      setN(0)
      return
    }
    // 尊重"减少动效"偏好：直接给最终值
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setN(target)
      return
    }
    let raf = 0
    let start = 0
    const step = (now: number) => {
      if (!start) start = now
      const p = Math.min(1, (now - start) / ms)
      const eased = 1 - Math.pow(1 - p, 3)
      setN(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    // 保底：万一 rAF 被节流/页面不在前台，ms 后直接给最终值，避免数字卡在中途
    const fallback = window.setTimeout(() => setN(target), ms + 120)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(fallback)
    }
  }, [target, ms])
  return n
}
