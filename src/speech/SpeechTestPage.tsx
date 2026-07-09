import { useRef, useState } from 'react'
import { parseAnswer, isCorrect, labelOf, type Answer } from './answer-mapping'
import { recognizeOnce, isWebSpeechSupported } from './webspeech'
import { startVosk, type VoskController } from './vosk'
import { asset } from '../data/asset'
import { useT } from '../i18n'

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
  const t = useT()
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

  function record(target: Answer, transcript: string, elapsedMs: number) {
    const parsed = parseAnswer(transcript)
    const ok = isCorrect(parsed, target)
    setLog((l) => [
      t('speech.logLine', {
        target: labelOf(target),
        transcript,
        parsed: parsed ? labelOf(parsed) : t('speech.parsedNone'),
        ok: ok ? '✓' : '✗',
        ms: elapsedMs.toFixed(0),
      }),
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
    const tgt = target
    try {
      const { transcript, elapsedMs } = await recognizeOnce('zh-CN', 6000)
      record(tgt, transcript, elapsedMs)
    } catch (e) {
      setLog((l) => [t('speech.error', { msg: (e as Error).message }), ...l])
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
        onError: (err) => setLog((l) => [t('speech.voskError', { msg: err.message }), ...l]),
      })
      setVoskReady(true)
      setVoskLoadMs(performance.now() - t0)
    } catch (e) {
      setLog((l) => [t('speech.loadFailed', { msg: (e as Error).message }), ...l])
    } finally {
      setBusy(false)
    }
  }

  // 方案 B：武装一次，下一个识别结果作为本题答案
  function listenB() {
    armedRef.current = { target, t0: performance.now() }
    setLog((l) => [t('speech.listening', { target: labelOf(target) }), ...l])
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
      <h2 className="fq-h2">{t('speech.title')}</h2>
      <p className="fq-sub">{t('speech.sub')}</p>

      <div className="fq-seg" style={{ marginTop: 14, display: 'flex' }}>
        <button className={engine === 'A' ? 'on' : ''} onClick={() => switchEngine('A')} style={{ flex: 1 }}>
          {t('speech.engineA')}
        </button>
        <button className={engine === 'B' ? 'on' : ''} onClick={() => switchEngine('B')} style={{ flex: 1 }}>
          {t('speech.engineB')}
        </button>
      </div>

      {engine === 'A' && !isWebSpeechSupported() && (
        <p style={{ color: 'var(--coral)', marginTop: 10, fontSize: 13 }}>{t('speech.noWebSpeech')}</p>
      )}

      <div className="fq-card" style={{ marginTop: 14, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('speech.sayThis')}</div>
        <div style={{ fontSize: 52, fontWeight: 800, color: 'var(--violet)', margin: '4px 0 16px' }}>{labelOf(target)}</div>
        {engine === 'A' ? (
          <button className="fq-cta" style={{ width: '100%' }} onClick={listenA} disabled={busy}>
            {busy ? t('speech.recognizing') : t('speech.startSpeaking')}
          </button>
        ) : !voskReady ? (
          <button className="fq-cta" style={{ width: '100%' }} onClick={loadVosk} disabled={busy}>
            {busy ? t('speech.loadingModel') : t('speech.loadModel')}
          </button>
        ) : (
          <button className="fq-cta" style={{ width: '100%' }} onClick={listenB}>
            {t('speech.startSpeaking')}
          </button>
        )}
      </div>

      <div className="fq-card" style={{ marginTop: 14, display: 'flex', alignItems: 'center' }}>
        <div className="fq-stat"><div className="n">{acc}%</div><div className="l">{t('speech.accuracy')}</div></div>
        <div style={{ width: 1, height: 36, background: 'var(--line)' }} />
        <div className="fq-stat"><div className="n">{avg}</div><div className="l">{t('speech.latency')}</div></div>
        <div style={{ width: 1, height: 36, background: 'var(--line)' }} />
        <div className="fq-stat"><div className="n">{stats.total}</div><div className="l">{t('speech.samples')}</div></div>
      </div>
      {engine === 'B' && voskLoadMs !== null && (
        <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
          {t('speech.modelLoadTime', { ms: voskLoadMs.toFixed(0) })}
        </p>
      )}

      {log.length > 0 && (
        <div className="fq-card" style={{ marginTop: 14 }}>
          <div className="fq-card-title">{t('speech.log')}</div>
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
