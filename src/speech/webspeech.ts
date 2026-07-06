export interface RecognitionResult {
  transcript: string
  elapsedMs: number
}

type SpeechRecognitionCtor = new () => {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: any) => void) | null
  onerror: ((e: any) => void) | null
  start: () => void
  abort: () => void
}

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function isWebSpeechSupported(): boolean {
  return getCtor() !== null
}

/**
 * 启动一次性识别，resolve 第一个最终结果的文本与端到端耗时（从 start 到 onresult）。
 * 必须在用户手势（点击）中调用。超时/出错 reject。
 */
export function recognizeOnce(lang = 'zh-CN', timeoutMs = 6000): Promise<RecognitionResult> {
  const Ctor = getCtor()
  if (!Ctor) return Promise.reject(new Error('Web Speech API not supported'))

  const recog = new Ctor()
  recog.lang = lang
  recog.interimResults = false
  recog.maxAlternatives = 1
  const started = performance.now()

  return new Promise<RecognitionResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        recog.abort()
      } catch {
        /* noop */
      }
      reject(new Error('recognition timeout'))
    }, timeoutMs)

    recog.onresult = (e: any) => {
      clearTimeout(timer)
      const transcript = String(e.results[0][0].transcript ?? '')
      resolve({ transcript, elapsedMs: performance.now() - started })
    }
    recog.onerror = (e: any) => {
      clearTimeout(timer)
      reject(new Error(`speech error: ${e.error ?? 'unknown'}`))
    }
    try {
      recog.start()
    } catch (err) {
      clearTimeout(timer)
      reject(err as Error)
    }
  })
}
