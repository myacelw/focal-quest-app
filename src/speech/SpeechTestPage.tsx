import { useRef, useState } from 'react'
import { parseAnswer, isCorrect, labelOf, type Answer } from './answer-mapping'
import { recognizeOnce, isWebSpeechSupported } from './webspeech'
import { startVosk, type VoskController } from './vosk'

type Engine = 'A' | 'B'

const TARGETS: Answer[] = [
  { kind: 'digit', value: 3 },
  { kind: 'digit', value: 7 },
  { kind: 'digit', value: 5 },
  { kind: 'direction', value: 'up' },
  { kind: 'direction', value: 'left' },
  { kind: 'direction', value: 'down' },
]

const VOSK_MODEL_URL = '/models/vosk-model-small-cn-0.22.tar.gz'
const VOSK_GRAMMAR = ['一 二 三 四 五 六 七 八 九 上 下 左 右']

export function SpeechTestPage() {
  const [engine, setEngine] = useState<Engine>('A')
  const [idx, setIdx] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState({ total: 0, correct: 0, sumMs: 0 })
  const [voskReady, setVoskReady] = useState(false)
  const [voskLoadMs, setVoskLoadMs] = useState<number | null>(null)

  const voskRef = useRef<VoskController | null>(null)
  const armedRef = useRef<{ target: Answer; t0: number } | null>(null)

  const target = TARGETS[idx % TARGETS.length]

  function record(t: Answer, transcript: string, elapsedMs: number) {
    const parsed = parseAnswer(transcript)
    const ok = isCorrect(parsed, t)
    setLog((l) => [
      `目标"${labelOf(t)}" | 识别"${transcript}" | 解析${parsed ? labelOf(parsed) : '∅'} | ${ok ? '✓' : '✗'} | ${elapsedMs.toFixed(0)}ms`,
      ...l,
    ])
    setStats((s) => ({
      total: s.total + 1,
      correct: s.correct + (ok ? 1 : 0),
      sumMs: s.sumMs + elapsedMs,
    }))
    setIdx((i) => i + 1)
  }

  // 方案 A：一次性识别
  async function listenA() {
    setBusy(true)
    const t = target
    try {
      const { transcript, elapsedMs } = await recognizeOnce('zh-CN', 6000)
      record(t, transcript, elapsedMs)
    } catch (e) {
      setLog((l) => [`错误：${(e as Error).message}`, ...l])
    } finally {
      setBusy(false)
    }
  }

  // 方案 B：先加载常驻模型
  async function loadVosk() {
    setBusy(true)
    const t0 = performance.now()
    try {
      voskRef.current = await startVosk({
        modelUrl: VOSK_MODEL_URL,
        grammar: VOSK_GRAMMAR,
        onResult: (text) => {
          const armed = armedRef.current
          if (!armed) return
          armedRef.current = null
          record(armed.target, text, performance.now() - armed.t0)
        },
        onError: (err) => setLog((l) => [`vosk 错误：${err.message}`, ...l]),
      })
      setVoskReady(true)
      setVoskLoadMs(performance.now() - t0)
    } catch (e) {
      setLog((l) => [`加载失败：${(e as Error).message}`, ...l])
    } finally {
      setBusy(false)
    }
  }

  // 方案 B：武装一次，下一个识别结果作为本题答案
  function listenB() {
    armedRef.current = { target, t0: performance.now() }
    setLog((l) => [`（正在听「${labelOf(target)}」…请说）`, ...l])
  }

  function switchEngine(next: Engine) {
    if (next === 'A' && voskRef.current) {
      voskRef.current.stop()
      voskRef.current = null
      setVoskReady(false)
    }
    setEngine(next)
    setStats({ total: 0, correct: 0, sumMs: 0 })
    setLog([])
  }

  const avg = stats.total ? (stats.sumMs / stats.total).toFixed(0) : '—'
  const acc = stats.total ? ((stats.correct / stats.total) * 100).toFixed(0) : '—'

  return (
    <div style={{ padding: 24 }}>
      <h2>语音测试</h2>
      <div style={{ marginBottom: 12 }}>
        <label style={{ marginRight: 16 }}>
          <input type="radio" checked={engine === 'A'} onChange={() => switchEngine('A')} /> 方案A
          Web Speech（走云）
        </label>
        <label>
          <input type="radio" checked={engine === 'B'} onChange={() => switchEngine('B')} /> 方案B
          vosk 离线
        </label>
      </div>

      {engine === 'A' && !isWebSpeechSupported() && (
        <p style={{ color: 'red' }}>此浏览器不支持 Web Speech API。</p>
      )}

      <p style={{ fontSize: 48, margin: '16px 0' }}>
        请说：<b>{labelOf(target)}</b>
      </p>

      {engine === 'A' ? (
        <button onClick={listenA} disabled={busy} style={{ fontSize: 24, padding: '12px 24px' }}>
          {busy ? '识别中…' : '开始说'}
        </button>
      ) : !voskReady ? (
        <button onClick={loadVosk} disabled={busy} style={{ fontSize: 20, padding: '12px 24px' }}>
          {busy ? '加载模型中…' : '加载离线模型（首次较慢）'}
        </button>
      ) : (
        <button onClick={listenB} style={{ fontSize: 24, padding: '12px 24px' }}>
          开始说
        </button>
      )}

      <p style={{ marginTop: 16 }}>
        准确率 <b>{acc}%</b> | 平均延迟 <b>{avg}ms</b> | 样本 {stats.total}
        {engine === 'B' && voskLoadMs !== null && <> | 模型加载 {voskLoadMs.toFixed(0)}ms</>}
      </p>
      <ul style={{ fontFamily: 'monospace', fontSize: 13 }}>
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  )
}
