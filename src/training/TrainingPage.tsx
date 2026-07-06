import { useEffect, useRef, useState } from 'react'
import { optotypeHeightPx } from './optotype-size'
import { cpm } from './cpm'
import {
  createSession, pickDirection, start, answer, advance, tick, accuracy,
  type SessionState, type Eye,
} from './session'
import { TumblingE } from './TumblingE'
import { playSfx, setMuted } from './sfx'
import { startVosk, type VoskController } from '../speech/vosk'
import { parseAnswer, type Direction } from '../speech/answer-mapping'

const DURATION_SEC = 180
const TRANSITION_MS = 1600
const VOSK_MODEL_URL = '/models/vosk-model-small-cn-0.22.tar.gz'
const VOSK_GRAMMAR = ['上 下 左 右']
const EYE_LABEL: Record<Eye, string> = { left: '左眼 · 遮右眼', right: '右眼 · 遮左眼' }
const ARROW: Record<Direction, string> = { up: '↑', down: '↓', left: '←', right: '→' }

function readPxPerMm(): number | null {
  const v = localStorage.getItem('fzp.cssPxPerMm')
  return v ? Number(v) : null
}

export function TrainingPage() {
  const [acuity, setAcuity] = useState(0.8)
  const [muted, setMutedState] = useState(false)
  const [session, setSession] = useState<SessionState>(() => createSession('left', DURATION_SEC))
  const [allDone, setAllDone] = useState(false)

  const pxPerMm = readPxPerMm()
  const sessionRef = useRef(session)
  const voskRef = useRef<VoskController | null>(null)

  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { setMuted(muted) }, [muted])

  useEffect(() => {
    if (session.phase !== 'showing' && session.phase !== 'transitioning') return
    const id = window.setInterval(() => setSession((s) => tick(s, 1)), 1000)
    return () => window.clearInterval(id)
  }, [session.phase])

  useEffect(() => {
    if (session.phase === 'finished') playSfx('finish')
  }, [session.phase])

  useEffect(() => () => { voskRef.current?.stop() }, [])

  function handleAnswer(dir: Direction) {
    const s = sessionRef.current
    if (s.phase !== 'showing' || s.target === null) return
    playSfx(dir === s.target ? 'correct' : 'wrong')
    setSession(answer(s, dir))
    window.setTimeout(() => {
      playSfx('flip')
      setSession((cur) =>
        cur.phase === 'transitioning'
          ? advance(cur, pickDirection(cur.target, Math.random()))
          : cur,
      )
    }, TRANSITION_MS)
  }

  async function beginSession() {
    if (!voskRef.current) {
      try {
        voskRef.current = await startVosk({
          modelUrl: VOSK_MODEL_URL,
          grammar: VOSK_GRAMMAR,
          onResult: (text) => {
            const parsed = parseAnswer(text)
            if (parsed?.kind === 'direction') handleAnswer(parsed.value)
          },
        })
      } catch {
        // 语音起不来不阻塞，触控兜底仍可用
      }
    }
    setSession((s) => start(s, pickDirection(null, Math.random())))
  }

  function nextEyeOrFinish() {
    if (session.eye === 'left') {
      setSession(createSession('right', DURATION_SEC))
    } else {
      setAllDone(true)
    }
  }

  if (pxPerMm === null) {
    return (
      <div style={{ padding: 24 }}>
        <h2>训练</h2>
        <p>请先到「标定」页完成屏幕标定，视标才能按正确大小显示。</p>
      </div>
    )
  }

  if (allDone) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <h2>今天的训练完成啦 🎉</h2>
        <p>左右眼都练好了。</p>
      </div>
    )
  }

  const heightPx = optotypeHeightPx(acuity, pxPerMm)
  const progress = Math.min(1, session.elapsedSec / session.durationSec)

  if (session.phase === 'preparing') {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <h2>准备：{EYE_LABEL[session.eye]}</h2>
        <p>遮住另一只眼，拍子正镜片面朝眼，坐直、离屏幕约 40cm。</p>
        <p>
          视力级别：
          <select value={acuity} onChange={(e) => setAcuity(Number(e.target.value))}>
            <option value={0.4}>0.4（大）</option>
            <option value={0.6}>0.6</option>
            <option value={0.8}>0.8</option>
            <option value={1.0}>1.0（小）</option>
          </select>
        </p>
        <button onClick={beginSession} style={{ fontSize: 22, padding: '12px 28px' }}>开始</button>
      </div>
    )
  }

  if (session.phase === 'finished') {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <h2>{session.eye === 'left' ? '左眼' : '右眼'} · 本节完成</h2>
        <p style={{ fontSize: 18 }}>
          答对 {session.correct}/{session.answered} ·
          正确率 {Math.round(accuracy(session) * 100)}% ·
          平均 CPM {Math.round(cpm(session.flips, session.elapsedSec))}
        </p>
        <button onClick={nextEyeOrFinish} style={{ fontSize: 20, padding: '12px 24px' }}>
          {session.eye === 'left' ? '换右眼继续' : '完成'}
        </button>
      </div>
    )
  }

  const transitioning = session.phase === 'transitioning'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '80vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 20px' }}>
        <span style={{ padding: '4px 10px', background: '#e6f1fb', borderRadius: 8 }}>
          {EYE_LABEL[session.eye]}
        </span>
        <div style={{ flex: 1, height: 6, background: '#eee', borderRadius: 3 }}>
          <div style={{ width: `${progress * 100}%`, height: '100%', background: '#1d9e75', borderRadius: 3 }} />
        </div>
        <button onClick={() => setMutedState((m) => !m)}>{muted ? '🔇' : '🔊'}</button>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111' }}>
        {transitioning ? (
          <div style={{ fontSize: 24, color: '#1d9e75' }}>翻！</div>
        ) : (
          session.target && (
            <div style={{ animation: 'fzpBlurIn 0.4s ease-out' }}>
              <TumblingE direction={session.target} heightPx={heightPx} />
            </div>
          )
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px' }}>
        <span style={{ color: '#1d9e75' }}>在听…说出方向</span>
        <span style={{ display: 'inline-flex', gap: 8 }}>
          {(['up', 'down', 'left', 'right'] as Direction[]).map((d) => (
            <button key={d} onClick={() => handleAnswer(d)} style={{ width: 48, height: 48, fontSize: 20 }}>
              {ARROW[d]}
            </button>
          ))}
        </span>
      </div>

      <style>{`@keyframes fzpBlurIn { from { filter: blur(8px); opacity: 0.2 } to { filter: blur(0); opacity: 1 } }`}</style>
    </div>
  )
}
