import { useState } from 'react'
import { parseAnswer, isCorrect, labelOf, type Answer } from './answer-mapping'
import { recognizeOnce, isWebSpeechSupported } from './webspeech'

const TARGETS: Answer[] = [
  { kind: 'digit', value: 3 },
  { kind: 'digit', value: 7 },
  { kind: 'digit', value: 5 },
  { kind: 'direction', value: 'up' },
  { kind: 'direction', value: 'left' },
  { kind: 'direction', value: 'down' },
]

export function SpeechTestPage() {
  const [idx, setIdx] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState({ total: 0, correct: 0, sumMs: 0 })

  const target = TARGETS[idx % TARGETS.length]

  async function listen() {
    setBusy(true)
    try {
      const { transcript, elapsedMs } = await recognizeOnce('zh-CN', 6000)
      const parsed = parseAnswer(transcript)
      const ok = isCorrect(parsed, target)
      setLog((l) => [
        `目标"${labelOf(target)}" | 识别"${transcript}" | 解析${parsed ? labelOf(parsed) : '∅'} | ${ok ? '✓' : '✗'} | ${elapsedMs.toFixed(0)}ms`,
        ...l,
      ])
      setStats((s) => ({
        total: s.total + 1,
        correct: s.correct + (ok ? 1 : 0),
        sumMs: s.sumMs + elapsedMs,
      }))
    } catch (e) {
      setLog((l) => [`错误：${(e as Error).message}`, ...l])
    } finally {
      setBusy(false)
      setIdx((i) => i + 1)
    }
  }

  if (!isWebSpeechSupported()) {
    return (
      <div style={{ padding: 24 }}>
        <h2>语音测试</h2>
        <p style={{ color: 'red' }}>此浏览器不支持 Web Speech API。</p>
      </div>
    )
  }

  const avg = stats.total ? (stats.sumMs / stats.total).toFixed(0) : '—'
  const acc = stats.total ? ((stats.correct / stats.total) * 100).toFixed(0) : '—'

  return (
    <div style={{ padding: 24 }}>
      <h2>语音测试（方案 A：Web Speech API，走云需联网）</h2>
      <p style={{ fontSize: 48, margin: '16px 0' }}>
        请说：<b>{labelOf(target)}</b>
      </p>
      <button onClick={listen} disabled={busy} style={{ fontSize: 24, padding: '12px 24px' }}>
        {busy ? '识别中…' : '开始说'}
      </button>
      <p style={{ marginTop: 16 }}>
        准确率 <b>{acc}%</b> | 平均延迟 <b>{avg}ms</b> | 样本 {stats.total}
      </p>
      <ul style={{ fontFamily: 'monospace', fontSize: 13 }}>
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  )
}
