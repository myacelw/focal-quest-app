import { createModel } from 'vosk-browser'

export interface VoskController {
  stop: () => void
}

export interface StartVoskOpts {
  modelUrl: string
  grammar: string[]
  onResult: (text: string) => void
  onError?: (err: Error) => void
}

/**
 * 加载 vosk 模型、打开麦克风、流式识别。
 * grammar 限定识别词表（大幅提升受限词准确率）；每出一个最终结果回调 onResult。
 * 返回的 stop() 释放麦克风与音频资源。
 */
export async function startVosk(opts: StartVoskOpts): Promise<VoskController> {
  const model = await createModel(opts.modelUrl)

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

  recognizer.on('result', (message: any) => {
    const text: string = message?.result?.text ?? ''
    if (text) opts.onResult(text)
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
