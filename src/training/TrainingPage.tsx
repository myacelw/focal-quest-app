import { useEffect, useRef, useState } from 'react'
import { acuityFromHeightMm } from './optotype-size'
import { cpm } from './cpm'
import {
  createSession, pickDirection, start, answer, advance, tick, accuracy,
  type SessionState, type Eye,
} from './session'
import { TumblingE } from './TumblingE'
import { playSfx, setMuted } from './sfx'
import { startVosk, type VoskController } from '../speech/vosk'
import { parseAnswer, type Direction } from '../speech/answer-mapping'
import { saveSession, doCheckIn, type CheckinResult } from '../data/checkin'
import { toDateStr } from '../data/date-utils'
import { syncBadges } from '../badges/badge-service'
import type { BadgeDef } from '../badges/badge-defs'

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
  const [sizeMm, setSizeMm] = useState<number>(() => {
    const v = localStorage.getItem('fzp.optotypeSizeMm')
    return v ? Number(v) : 1
  })
  const [muted, setMutedState] = useState(false)
  const [session, setSession] = useState<SessionState>(() => createSession('left', DURATION_SEC))
  const [checkin, setCheckin] = useState<CheckinResult | null>(null)
  const [newBadges, setNewBadges] = useState<BadgeDef[]>([])

  const pxPerMm = readPxPerMm()
  const sessionRef = useRef(session)
  const voskRef = useRef<VoskController | null>(null)
  const savedRef = useRef(false)
  const sizeMmRef = useRef(sizeMm)

  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { setMuted(muted) }, [muted])
  useEffect(() => {
    sizeMmRef.current = sizeMm
    localStorage.setItem('fzp.optotypeSizeMm', String(sizeMm))
  }, [sizeMm])

  useEffect(() => {
    if (session.phase !== 'showing' && session.phase !== 'transitioning') return
    const id = window.setInterval(() => setSession((s) => tick(s, 1)), 1000)
    return () => window.clearInterval(id)
  }, [session.phase])

  // 节结束：落库一次（savedRef 防重复），并播结算音
  useEffect(() => {
    if (session.phase !== 'finished' || savedRef.current) return
    savedRef.current = true
    playSfx('finish')
    void saveSession({
      date: toDateStr(new Date()),
      startedAtMs: Date.now() - session.elapsedSec * 1000,
      eye: session.eye,
      answered: session.answered,
      correct: session.correct,
      flips: session.flips,
      elapsedSec: session.elapsedSec,
      acuity: acuityFromHeightMm(sizeMmRef.current),
    })
  }, [session.phase, session.eye, session.answered, session.correct, session.flips, session.elapsedSec])

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
    savedRef.current = false
    setSession((s) => start(s, pickDirection(null, Math.random())))
  }

  async function nextEyeOrFinish() {
    if (session.eye === 'left') {
      savedRef.current = false
      setSession(createSession('right', DURATION_SEC))
    } else {
      const result = await doCheckIn(toDateStr(new Date()))
      const unlocked = await syncBadges(Date.now())
      playSfx(unlocked.length > 0 ? 'badge' : 'checkin')
      setNewBadges(unlocked)
      setCheckin(result)
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

  if (checkin) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <h2>{checkin.alreadyCheckedIn ? '今天已经打过卡啦' : '打卡成功 🎉'}</h2>
        <p style={{ fontSize: 20 }}>
          🔥 连续 {checkin.streak} 天
          {!checkin.alreadyCheckedIn && <> · 今日 +{checkin.dailyPoints} 分</>}
        </p>
        <p style={{ color: '#1d9e75' }}>⭐ 累计 {checkin.totalPoints} 分</p>
        {newBadges.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontWeight: 700 }}>🎉 解锁新勋章！</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {newBadges.map((b) => (
                <div key={b.id} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 32 }}>{b.emoji}</div>
                  <div style={{ fontSize: 12 }}>{b.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const heightPx = sizeMm * pxPerMm
  const progress = Math.min(1, session.elapsedSec / session.durationSec)

  if (session.phase === 'preparing') {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <h2>准备：{EYE_LABEL[session.eye]}</h2>
        <p>遮住另一只眼，拍子正镜片面朝眼，坐直、离屏幕约 40cm。</p>
        <div style={{ margin: '16px 0' }}>
          <label>
            视标大小：<b>{sizeMm.toFixed(1)} mm</b>（≈ {acuityFromHeightMm(sizeMm).toFixed(2)} 视力级别）
          </label>
          <br />
          <input
            type="range"
            min={0.3}
            max={2}
            step={0.1}
            value={sizeMm}
            onChange={(e) => setSizeMm(Number(e.target.value))}
            style={{ width: 260, marginTop: 8 }}
          />
          <div style={{ marginTop: 12, color: '#111' }}>
            <TumblingE direction="up" heightPx={sizeMm * pxPerMm} />
          </div>
          <p style={{ fontSize: 12, color: '#888' }}>把上面这个 E 调到孩子能看清、但要努力的大小</p>
        </div>
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
          {session.eye === 'left' ? '换右眼继续' : '完成并打卡'}
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
