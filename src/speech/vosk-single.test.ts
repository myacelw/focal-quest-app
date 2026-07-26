import { describe, it, expect } from 'vitest'
import { makeVoskStarter, type VoskController } from './vosk-single'

/**
 * 复现并锚定一个把 iPad 上的 PWA 直接搞崩的 bug。
 *
 * 现场：孩子第一只眼练完（3 分钟），42MB 语音模型还在加载中；点「下一只眼」→ 纯白屏、
 * 退回主屏（没有 ErrorBoundary 的报错页，因为不是 JS 异常，是 Safari 把进程杀了）。
 *
 * 根因：TrainingPage 的复用防护是 `if (voskRef.current) return`，而 voskRef 只在加载
 * **成功后**才被赋值。模型仍在加载时它还是 null，于是又启动一次 startVosk——同时加载
 * 两份模型：每份要 fetch 3×20MB 分片、拼成 60MB Blob、再让 worker 解压，外加第二个
 * 麦克风流与 AudioContext。峰值几百 MB，iPad 的 PWA 内存上限撑不住。
 *
 * 所以去重必须做在模块层：无论谁调用、调用几次，同一时刻只启动一份。
 */

function fakeController(tag: string): VoskController & { tag: string } {
  return { tag, stop: () => {} }
}

describe('makeVoskStarter 并发去重', () => {
  it('加载期间的重复调用不会启动第二份模型（这正是白屏的根因）', async () => {
    let starts = 0
    let release: (c: VoskController) => void = () => {}
    const start = makeVoskStarter(() => {
      starts += 1
      return new Promise<VoskController>((res) => { release = res })
    })

    // 第一只眼开始训练：启动加载，故意不 resolve（模拟 42MB 还在下）
    const p1 = start({ onResult: () => {} })
    // 点「下一只眼」：加载仍未完成时再次调用
    const p2 = start({ onResult: () => {} })
    expect(starts).toBe(1)

    release(fakeController('a'))
    const [c1, c2] = await Promise.all([p1, p2])
    expect(c1).toBe(c2) // 两次调用拿到同一个 controller
    expect(starts).toBe(1)
  })

  it('加载完成后再调用直接复用，不重新加载', async () => {
    let starts = 0
    const start = makeVoskStarter(() => {
      starts += 1
      return Promise.resolve(fakeController('a'))
    })
    const c1 = await start({ onResult: () => {} })
    const c2 = await start({ onResult: () => {} })
    expect(starts).toBe(1)
    expect(c1).toBe(c2)
  })

  it('最后一次调用的 onResult 生效（换眼后答题要能被识别到）', async () => {
    const seen: string[] = []
    let forward: (t: string) => void = () => {}
    const start = makeVoskStarter((opts) => {
      forward = opts.onResult // 底层只认它拿到的那个回调
      return Promise.resolve(fakeController('a'))
    })

    await start({ onResult: () => seen.push('第一只眼') })
    await start({ onResult: () => seen.push('第二只眼') })
    forward('上')
    // 若不做转发，这里会是「第一只眼」——换眼后语音答题就失灵了
    expect(seen).toEqual(['第二只眼'])
  })

  it('加载失败后允许重试（否则一次网络抖动就永久没语音）', async () => {
    let starts = 0
    const start = makeVoskStarter(() => {
      starts += 1
      return starts === 1
        ? Promise.reject(new Error('模型分片加载失败'))
        : Promise.resolve(fakeController('ok'))
    })
    await expect(start({ onResult: () => {} })).rejects.toThrow('模型分片加载失败')
    const c = await start({ onResult: () => {} })
    expect(c.stop).toBeTypeOf('function')
    expect(starts).toBe(2)
  })

  it('stop 后可以重新启动（退出训练页再进来）', async () => {
    let starts = 0
    const start = makeVoskStarter(() => {
      starts += 1
      return Promise.resolve(fakeController('c' + starts))
    })
    const c1 = await start({ onResult: () => {} })
    c1.stop()
    const c2 = await start({ onResult: () => {} })
    expect(starts).toBe(2)
    expect(c2).not.toBe(c1)
  })
})
