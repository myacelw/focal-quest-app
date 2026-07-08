import { useEffect, useRef, useState } from 'react'
import { acuityFromHeightMm } from './optotype-size'
import {
  createSession, pickDirection, start, answer, advance, tick, accuracy,
  type SessionState, type Eye,
} from './session'
import { playSfx, setMuted } from './sfx'
import { startVosk, type VoskController } from '../speech/vosk'
import { parseAnswer, type Direction } from '../speech/answer-mapping'
import { saveSession, doCheckIn, getHomeStats, type CheckinResult } from '../data/checkin'
import { toDateStr } from '../data/date-utils'
import { syncBadges } from '../badges/badge-service'
import type { BadgeDef } from '../badges/badge-defs'
import { getSkin, getSkinId, isSkinUnlocked, newlyUnlockedSkins } from '../skins/registry'
import type { Skin } from '../skins/types'

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

function readDurationSec(): number {
  const v = localStorage.getItem('fzp.durationSec')
  return v ? Number(v) : DURATION_SEC
}

export function TrainingPage() {
  const [muted, setMutedState] = useState(false)
  const [session, setSession] = useState<SessionState>(() => createSession('left', readDurationSec()))
  const [checkin, setCheckin] = useState<CheckinResult | null>(null)
  const [newBadges, setNewBadges] = useState<BadgeDef[]>([])
  const [newSkins, setNewSkins] = useState<Skin[]>([])
  const [lastAnswer, setLastAnswer] = useState<{ dir: Direction; correct: boolean; seq: number } | null>(null)
  const [totalPoints, setTotalPoints] = useState<number | null>(null)
  const [voskStatus, setVoskStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const [paused, setPaused] = useState(false)

  const pxPerMm = readPxPerMm()
  const sessionRef = useRef(session)
  const voskRef = useRef<VoskController | null>(null)
  const savedRef = useRef(false)
  const sizeMmRef = useRef(1)
  const seqRef = useRef(0)
  const targetShownAtRef = useRef(0)
  const sumReactionRef = useRef(0)
  const reactionCountRef = useRef(0)
  const pausedRef = useRef(false)

  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { setMuted(muted) }, [muted])

  useEffect(() => { pausedRef.current = paused }, [paused])

  useEffect(() => {
    if (paused) return
    if (session.phase !== 'showing' && session.phase !== 'transitioning') return
    const id = window.setInterval(() => setSession((s) => tick(s, 1)), 1000)
    return () => window.clearInterval(id)
  }, [session.phase, paused])

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
      avgReactionMs: reactionCountRef.current ? Math.round(sumReactionRef.current / reactionCountRef.current) : 0,
    })
  }, [session.phase, session.eye, session.answered, session.correct, session.flips, session.elapsedSec])

  useEffect(() => () => { voskRef.current?.stop() }, [])

  // 记录每个视标出现的时刻，用于算"看清→答对"的反应时间（调节速度的直接指标）
  useEffect(() => {
    if (session.phase === 'showing') targetShownAtRef.current = Date.now()
  }, [session.phase, session.target, session.flips])

  // 读累计积分用于皮肤解锁判定（只读不打卡）
  useEffect(() => {
    void getHomeStats(toDateStr(new Date())).then((s) => setTotalPoints(s.totalPoints))
  }, [])

  function handleAnswer(dir: Direction) {
    const s = sessionRef.current
    if (pausedRef.current) return
    if (s.phase !== 'showing' || s.target === null) return
    const right = dir === s.target
    if (right && targetShownAtRef.current) {
      sumReactionRef.current += Date.now() - targetShownAtRef.current
      reactionCountRef.current += 1
    }
    playSfx(s.isEgg && right ? 'egg' : right ? 'correct' : 'wrong')
    seqRef.current += 1
    setLastAnswer({ dir, correct: right, seq: seqRef.current })
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

  function beginSession() {
    // 立即出视标（触控就能玩），vosk 后台异步加载——不让用户干等 42MB 模型
    savedRef.current = false
    sumReactionRef.current = 0
    reactionCountRef.current = 0
    setPaused(false)
    setSession((s) => start(s, pickDirection(null, Math.random())))
    if (voskRef.current) {
      setVoskStatus('ready')
      return
    }
    setVoskStatus('loading')
    startVosk({
      modelUrl: VOSK_MODEL_URL,
      grammar: VOSK_GRAMMAR,
      onResult: (text) => {
        const parsed = parseAnswer(text)
        if (parsed?.kind === 'direction') handleAnswer(parsed.value)
      },
    })
      .then((c) => {
        voskRef.current = c
        setVoskStatus('ready')
      })
      .catch(() => setVoskStatus('failed')) // 语音起不来不阻塞，触控兜底仍可用
  }

  async function nextEyeOrFinish() {
    if (session.eye === 'left') {
      savedRef.current = false
      setSession(createSession('right', readDurationSec()))
    } else {
      const result = await doCheckIn(toDateStr(new Date()))
      const unlocked = await syncBadges(Date.now())
      const prevPoints = result.alreadyCheckedIn ? result.totalPoints : result.totalPoints - result.dailyPoints
      const skins = newlyUnlockedSkins(prevPoints, result.totalPoints)
      playSfx(unlocked.length > 0 || skins.length > 0 ? 'badge' : 'checkin')
      setNewBadges(unlocked)
      setNewSkins(skins)
      setCheckin(result)
    }
  }

  if (pxPerMm === null) {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '48px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 46 }}>📐</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginTop: 10 }}>先完成屏幕标定</h2>
        <p style={{ color: 'var(--muted)', marginTop: 8, lineHeight: 1.6 }}>
          请先到「📐 标定」页完成一次屏幕标定，视标才能按正确的物理大小显示。
        </p>
      </div>
    )
  }

  if (checkin) {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 54 }}>{checkin.alreadyCheckedIn ? '✓' : '🎉'}</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
          {checkin.alreadyCheckedIn ? '今天已经打过卡啦' : '打卡成功！'}
        </h2>
        <div
          className="fq-card"
          style={{ marginTop: 18, background: 'linear-gradient(135deg,#ff8a5b,#ff5c86)', border: 'none', color: '#fff', boxShadow: 'var(--shadow-coral)' }}
        >
          <div style={{ fontSize: 22, fontWeight: 800 }}>🔥 连续 {checkin.streak} 天</div>
          {!checkin.alreadyCheckedIn && <div style={{ fontSize: 14, marginTop: 8, opacity: 0.95 }}>今日 +{checkin.dailyPoints} 分</div>}
          <div style={{ fontSize: 14, marginTop: 6, opacity: 0.95 }}>⭐ 累计 {checkin.totalPoints} 分</div>
        </div>
        {newBadges.length > 0 && (
          <div className="fq-card" style={{ marginTop: 14 }}>
            <p style={{ fontWeight: 700, marginBottom: 12 }}>🎉 解锁新勋章！</p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              {newBadges.map((b) => (
                <div key={b.id} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 34 }}>{b.emoji}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{b.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {newSkins.length > 0 && (
          <div className="fq-card" style={{ marginTop: 14 }}>
            <p style={{ fontWeight: 700, marginBottom: 12 }}>🎨 解锁新皮肤！</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {newSkins.map((s) => (
                <span key={s.id} className="fq-chip" style={{ background: '#fff9e6', color: '#b8860b', border: '1.5px solid var(--lemon)' }}>
                  {s.name}
                </span>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>去准备页换上试试～</p>
          </div>
        )}
      </div>
    )
  }

  const sizeMm = Number(localStorage.getItem('fzp.optotypeSizeMm') ?? '1')
  sizeMmRef.current = sizeMm
  const skinId = getSkinId()
  const heightPx = sizeMm * pxPerMm
  const progress = Math.min(1, session.elapsedSec / session.durationSec)
  // 生效皮肤：选中的若未解锁（如手改存储）则回退朴素；加载中(null)信任存储值避免闪烁
  const effectiveSkinId =
    totalPoints === null || isSkinUnlocked(skinId, totalPoints) ? skinId : 'plain'
  const CurrentSkin = getSkin(effectiveSkinId)

  if (session.phase === 'preparing') {
    return (
      <div
        style={{
          maxWidth: 420,
          margin: '0 auto',
          padding: '40px 20px',
          textAlign: 'center',
          minHeight: 'calc(100vh - 57px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: 56 }}>👁️</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 10 }}>准备好了吗？</h2>
        <div
          className="fq-card"
          style={{ marginTop: 18, background: 'linear-gradient(135deg, #7c6cf0, #8b6cff)', border: 'none', color: '#fff', boxShadow: 'var(--shadow)' }}
        >
          <div style={{ fontSize: 19, fontWeight: 800 }}>{EYE_LABEL[session.eye]}</div>
          <p style={{ fontSize: 13, opacity: 0.92, marginTop: 8, lineHeight: 1.6 }}>拍子正镜片面朝眼，坐直、离屏幕约 40cm</p>
        </div>
        <button className="fq-cta" style={{ width: '100%', marginTop: 22, fontSize: 21, padding: '18px' }} onClick={beginSession}>
          ▶ 开始
        </button>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16 }}>视标大小 / 时长 / 皮肤 可在「⚙️ 设置」里调</p>
      </div>
    )
  }

  if (session.phase === 'finished') {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 50 }}>🎊</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
          {session.eye === 'left' ? '左眼' : '右眼'} · 本节完成
        </h2>
        <div className="fq-card" style={{ marginTop: 18, display: 'flex', justifyContent: 'space-around' }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--violet)' }}>{session.correct}/{session.answered}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>答对</div>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--violet)' }}>{Math.round(accuracy(session) * 100)}%</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>正确率</div>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--violet)' }}>
              {reactionCountRef.current ? (sumReactionRef.current / reactionCountRef.current / 1000).toFixed(1) : '—'}
              <span style={{ fontSize: 14 }}>s</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>平均反应</div>
          </div>
        </div>
        <button className="fq-cta coral" style={{ width: '100%', marginTop: 16 }} onClick={nextEyeOrFinish}>
          {session.eye === 'left' ? '换右眼继续 →' : '完成并打卡 🎊'}
        </button>
      </div>
    )
  }

  const voskHint =
    voskStatus === 'loading' ? '🎤 语音加载中…（可先用按钮）'
    : voskStatus === 'ready' ? '🎧 在听…说出方向'
    : voskStatus === 'failed' ? '🔇 语音没启动，用按钮答'
    : '👇 用下方按钮答'

  const remainSec = Math.max(0, session.durationSec - session.elapsedSec)
  const mmss = `${Math.floor(remainSec / 60)}:${String(remainSec % 60).padStart(2, '0')}`

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 57px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
        <span className="fq-chip">{EYE_LABEL[session.eye]}</span>
        <div className="fq-bar" style={{ flex: 1 }}>
          <i style={{ width: `${progress * 100}%` }} />
        </div>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: 'var(--violet)', fontSize: 15, minWidth: 40, textAlign: 'right' }}>{mmss}</span>
        <button className="fq-btn" style={{ padding: '7px 10px' }} onClick={() => setPaused(true)} aria-label="暂停">⏸️</button>
        <button className="fq-btn" style={{ padding: '7px 10px' }} onClick={() => setMutedState((m) => !m)}>
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0' }}>
        <CurrentSkin.Stage
          target={session.target}
          heightPx={heightPx}
          phase={session.phase === 'transitioning' ? 'transitioning' : 'showing'}
          lastAnswer={lastAnswer}
          isEgg={session.isEgg}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px 22px' }}>
        <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>{voskHint}</span>
        <span style={{ display: 'inline-flex', gap: 8 }}>
          {(['up', 'down', 'left', 'right'] as Direction[]).map((d) => (
            <button
              key={d}
              onClick={() => handleAnswer(d)}
              style={{ width: 52, height: 52, fontSize: 22, fontWeight: 700, borderRadius: 14, border: '1.5px solid var(--line)', background: '#fff', color: 'var(--violet)', cursor: 'pointer', boxShadow: 'var(--shadow)' }}
            >
              {ARROW[d]}
            </button>
          ))}
        </span>
      </div>

      {paused && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(51,40,90,0.72)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: 20 }}>
          <div className="fq-card fq-rise" style={{ textAlign: 'center', maxWidth: 300 }}>
            <div style={{ fontSize: 52 }}>⏸️</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>已暂停</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>剩余 {mmss}，休息好了继续～</p>
            <button className="fq-cta" style={{ width: '100%', marginTop: 14 }} onClick={() => setPaused(false)}>▶ 继续</button>
          </div>
        </div>
      )}
    </div>
  )
}
