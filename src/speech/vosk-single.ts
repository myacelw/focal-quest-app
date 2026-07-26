/**
 * vosk 启动的单例化包装——**修的是一个会把 iPad 上的 PWA 直接搞崩的 bug**。
 *
 * 现场：孩子第一只眼练完时 42MB 模型还在加载中，点「下一只眼」→ 纯白屏、退回主屏。
 * 不是 JS 异常（否则 ErrorBoundary 会显示报错页），是 Safari 因内存压力终止了进程。
 *
 * 根因：调用方的复用防护是「controller 已存在就跳过」，而 controller 只在加载**成功后**
 * 才存在。模型仍在下载时防护失效，于是并发启动第二份加载——每份要 fetch 3×20MB 分片、
 * 拼成 60MB Blob、让 worker 解压模型，再加一个麦克风流与 AudioContext。峰值几百 MB。
 *
 * 为什么把去重放在这一层而不是调用方：调用方的防护挡不住"加载中"这个窗口，而且将来
 * 任何新调用点都得重新记得加一遍。放这里则无论谁调、调几次，同一时刻只有一份在跑。
 */
export interface VoskController {
  stop: () => void
}

/** 只保留去重逻辑关心的那部分入参；真实的 StartVoskOpts 是它的超集 */
export interface StarterOpts {
  onResult: (text: string) => void
}

/**
 * 把「实际启动」注入进来，好让并发去重逻辑能在 node 环境单测
 * （真实实现依赖 wasm / getUserMedia / AudioContext，测试环境都没有）。
 */
export function makeVoskStarter<O extends StarterOpts>(
  impl: (opts: O) => Promise<VoskController>,
): (opts: O) => Promise<VoskController> {
  let inflight: Promise<VoskController> | null = null
  let current: VoskController | null = null
  // 结果回调用一层转发：底层只认它启动时拿到的那个回调，而换眼后调用方会传新的
  // handleAnswer（闭包里的 session 不同）。不转发的话，换眼后语音答题会失灵。
  let handler: ((text: string) => void) | null = null

  return function start(opts: O): Promise<VoskController> {
    handler = opts.onResult
    if (current) return Promise.resolve(current)
    if (inflight) return inflight

    const forwarding = { ...opts, onResult: (text: string) => handler?.(text) }
    inflight = impl(forwarding)
      .then((c) => {
        // 包一层，好在 stop 时把单例状态一起清掉——否则退出训练页再进来会拿到已停的实例
        const wrapped: VoskController = {
          stop: () => {
            if (current === wrapped) {
              current = null
              handler = null
            }
            c.stop()
          },
        }
        current = wrapped
        inflight = null
        return wrapped
      })
      .catch((e: unknown) => {
        // 失败要允许重试：一次网络抖动不该让这台设备从此没有语音
        inflight = null
        throw e
      })
    return inflight
  }
}
