import { useRef, useState } from 'react'
import { parseAnswer, isCorrect, labelOf, type Answer } from './answer-mapping'
import { recognizeOnce, isWebSpeechSupported } from './webspeech'
import { startVosk, type VoskController } from './vosk'
import { asset } from '../data/asset'

type Engine = 'A' | 'B'

const TARGETS: Answer[] = [
  { kind: 'digit', value: 3 },
  { kind: 'digit', value: 7 },
  { kind: 'digit', value: 5 },
  { kind: 'direction', value: 'up' },
  { kind: 'direction', value: 'left' },
  { kind: 'direction', value: 'down' },
]

const VOSK_MODEL_URL = asset('/models/vosk-model-small-cn-0.22.tar.gz')
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
    <div className="fq-page fq-rise">
      <h2 className="fq-h2">🎤 语音测试</h2>
      <p className="fq-sub">开发调试用：对比两种语音识别方案的准确率和延迟。</p>

      <div className="fq-seg" style={{ marginTop: 14, display: 'flex' }}>
        <button className={engine === 'A' ? 'on' : ''} onClick={() => switchEngine('A')} style={{ flex: 1 }}>
          方案A · 云
        </button>
        <button className={engine === 'B' ? 'on' : ''} onClick={() => switchEngine('B')} style={{ flex: 1 }}>
          方案B · 离线
        </button>
      </div>

      {engine === 'A' && !isWebSpeechSupported() && (
        <p style={{ color: 'var(--coral)', marginTop: 10, fontSize: 13 }}>此浏览器不支持 Web Speech API。</p>
      )}

      <div className="fq-card" style={{ marginTop: 14, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>请说出</div>
        <div style={{ fontSize: 52, fontWeight: 800, color: 'var(--violet)', margin: '4px 0 16px' }}>{labelOf(target)}</div>
        {engine === 'A' ? (
          <button className="fq-cta" style={{ width: '100%' }} onClick={listenA} disabled={busy}>
            {busy ? '识别中…' : '🎙️ 开始说'}
          </button>
        ) : !voskReady ? (
          <button className="fq-cta" style={{ width: '100%' }} onClick={loadVosk} disabled={busy}>
            {busy ? '加载模型中…' : '⬇️ 加载离线模型（首次较慢）'}
          </button>
        ) : (
          <button className="fq-cta" style={{ width: '100%' }} onClick={listenB}>
            🎙️ 开始说
          </button>
        )}
      </div>

      <div className="fq-card" style={{ marginTop: 14, display: 'flex', alignItems: 'center' }}>
        <div className="fq-stat"><div className="n">{acc}%</div><div className="l">准确率</div></div>
        <div style={{ width: 1, height: 36, background: 'var(--line)' }} />
        <div className="fq-stat"><div className="n">{avg}</div><div className="l">延迟 ms</div></div>
        <div style={{ width: 1, height: 36, background: 'var(--line)' }} />
        <div className="fq-stat"><div className="n">{stats.total}</div><div className="l">样本</div></div>
      </div>
      {engine === 'B' && voskLoadMs !== null && (
        <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
          模型加载 {voskLoadMs.toFixed(0)}ms
        </p>
      )}

      {log.length > 0 && (
        <div className="fq-card" style={{ marginTop: 14 }}>
          <div className="fq-card-title">📋 识别日志</div>
          <ul style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, margin: 0, padding: 0, listStyle: 'none', color: 'var(--muted)' }}>
            {log.map((line, i) => (
              <li key={i} style={{ padding: '5px 0', borderBottom: i < log.length - 1 ? '1px solid var(--line)' : 'none' }}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
