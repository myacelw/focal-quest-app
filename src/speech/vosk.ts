import { makeVoskStarter, type VoskController } from './vosk-single'
import { makeUtteranceGate } from './utterance-gate'

export type { VoskController }

export interface StartVoskOpts {
  modelUrl: string
  grammar: string[]
  onResult: (text: string) => void
  onError?: (err: Error) => void
}

/**
 * 解析模型 URL。模型完整包 41MB 超 EdgeOne Pages 单文件 25MiB 上限，故切成分片部署；
 * 若同目录存在 `<model>.parts.json`（{count}），就把各分片拼回一个完整包的 blob URL
 * 喂给 createModel（vosk worker 用 fetch 读取，blob: URL 同源可读）。没有分片清单则用原始 URL。
 */
async function resolveModelUrl(modelUrl: string): Promise<{ url: string; revoke: () => void }> {
  const noop = { url: modelUrl, revoke: () => {} }
  let count = 0
  try {
    const r = await fetch(`${modelUrl}.parts.json`)
    // 注意：静态托管的 SPA 回退会把不存在的路径返回 index.html（text/html），故须校验是 JSON
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
      count = Number((await r.json())?.count) || 0
    }
  } catch {
    /* 无分片清单：直接用原始 URL */
  }
  if (count < 1) return noop

  const buffers: ArrayBuffer[] = []
  for (let i = 0; i < count; i++) {
    const partUrl = `${modelUrl}.part${String(i).padStart(2, '0')}`
    const res = await fetch(partUrl)
    if (!res.ok) throw new Error(`模型分片加载失败：${partUrl} (${res.status})`)
    buffers.push(await res.arrayBuffer())
  }
  const url = URL.createObjectURL(new Blob(buffers, { type: 'application/gzip' }))
  return { url, revoke: () => URL.revokeObjectURL(url) }
}

/**
 * 加载 vosk 模型、打开麦克风、流式识别。
 * grammar 限定识别词表（大幅提升受限词准确率）；每出一个最终结果回调 onResult。
 * 返回的 stop() 释放麦克风与音频资源。
 *
 * ⚠️ 不要直接导出这个函数——它必须经 `makeVoskStarter` 单例化后才能对外用。
 * 并发调用会同时加载两份 42MB 模型（各需 fetch 3×20MB 分片 + 60MB Blob + worker 解压），
 * iPad 上的 PWA 会被 Safari 因内存压力直接终止（表现为纯白屏退回主屏，无任何报错页）。
 * 详见 vosk-single.ts 的注释与 vosk-single.test.ts 的锚定用例。
 */
async function startVoskUncached(opts: StartVoskOpts): Promise<VoskController> {
  // 动态 import：vosk-browser（含 wasm）只在真正开始训练时才加载，不拖累首屏
  const { createModel } = await import('vosk-browser')
  const { url: resolvedModelUrl, revoke } = await resolveModelUrl(opts.modelUrl)
  let model: Awaited<ReturnType<typeof createModel>>
  try {
    model = await createModel(resolvedModelUrl)
  } finally {
    revoke() // 模型已加载完（worker 已 fetch），释放 blob URL
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    video: false,
  })

  const audioContext = new AudioContext()
  // grammar 传空格分词的词串数组，加 "[unk]" 允许未知兜底
  const recognizer = new (model as any).KaldiRecognizer(
    audioContext.sampleRate,
    JSON.stringify([...opts.grammar, '[unk]']),
  )

  // 听 partial 而不只听 final，是这里最要紧的一处提速：
  // final（'result'）要等 vosk 检测到说完后的静音（endpointing）才吐，实测约 1 秒；
  // partial 在说话过程中就持续吐。本项目词表只有「上下左右」四个词，partial 里一旦出现
  // 方向词答案就已确定，不存在"说完变成另一个词"，所以可以当场接受。
  // 去重交给 utterance-gate（partial 会连吐同一句，不挡会一次发声连答好几题）。
  const gate = makeUtteranceGate()

  recognizer.on('partialresult', (message: any) => {
    const partial: string = message?.result?.partial ?? ''
    const accepted = gate.onPartial(partial)
    if (accepted !== null) opts.onResult(accepted)
  })

  recognizer.on('result', (message: any) => {
    const text: string = message?.result?.text ?? ''
    // partial 已放行则返回 null（不重复答题）；partial 没识别出来时由 final 兜底
    const accepted = gate.onFinal(text)
    if (accepted !== null) opts.onResult(accepted)
  })

  const source = audioContext.createMediaStreamSource(stream)
  const processor = audioContext.createScriptProcessor(4096, 1, 1)
  processor.onaudioprocess = (event: AudioProcessingEvent) => {
    try {
      recognizer.acceptWaveform(event.inputBuffer)
    } catch (e) {
      opts.onError?.(e as Error)
    }
  }
  source.connect(processor)
  processor.connect(audioContext.destination)

  return {
    stop: () => {
      try {
        processor.disconnect()
      } catch {
        /* noop */
      }
      try {
        source.disconnect()
      } catch {
        /* noop */
      }
      stream.getTracks().forEach((t) => t.stop())
      void audioContext.close()
      try {
        ;(recognizer as any).remove?.()
      } catch {
        /* noop */
      }
      try {
        ;(model as any).terminate?.()
      } catch {
        /* noop */
      }
    },
  }
}

/**
 * 对外的启动入口：**已单例化**。并发或重复调用只会加载一份模型，最后一次传入的
 * onResult 生效（换眼后 handleAnswer 闭包会变，必须转发到最新的那个）。
 * 加载失败允许重试；stop() 后可重新启动。
 */
export const startVosk = makeVoskStarter<StartVoskOpts>(startVoskUncached)
