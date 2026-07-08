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
import { saveSession, doCheckIn, getHomeStats, type CheckinResult } from '../data/checkin'
import { toDateStr } from '../data/date-utils'
import { syncBadges } from '../badges/badge-service'
import type { BadgeDef } from '../badges/badge-defs'
import { getSkin, getSkinId, setSkinId, isSkinUnlocked, skinUnlockCost, newlyUnlockedSkins, SKINS } from '../skins/registry'
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

export function TrainingPage() {
  const [sizeMm, setSizeMm] = useState<number>(() => {
    const v = localStorage.getItem('fzp.optotypeSizeMm')
    return v ? Number(v) : 1
  })
  const [muted, setMutedState] = useState(false)
  const [session, setSession] = useState<SessionState>(() => createSession('left', DURATION_SEC))
  const [checkin, setCheckin] = useState<CheckinResult | null>(null)
  const [newBadges, setNewBadges] = useState<BadgeDef[]>([])
  const [newSkins, setNewSkins] = useState<Skin[]>([])
  const [skinId, setSkinIdState] = useState(() => getSkinId())
  const [lastAnswer, setLastAnswer] = useState<{ dir: Direction; correct: boolean; seq: number } | null>(null)
  const [totalPoints, setTotalPoints] = useState<number | null>(null)
  const [voskStatus, setVoskStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')

  const pxPerMm = readPxPerMm()
  const sessionRef = useRef(session)
  const voskRef = useRef<VoskController | null>(null)
  const savedRef = useRef(false)
  const sizeMmRef = useRef(sizeMm)
  const seqRef = useRef(0)

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

  // 读累计积分用于皮肤解锁判定（只读不打卡）
  useEffect(() => {
    void getHomeStats(toDateStr(new Date())).then((s) => setTotalPoints(s.totalPoints))
  }, [])

  function handleAnswer(dir: Direction) {
    const s = sessionRef.current
    if (s.phase !== 'showing' || s.target === null) return
    const right = dir === s.target
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
      setSession(createSession('right', DURATION_SEC))
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

  const heightPx = sizeMm * pxPerMm
  const progress = Math.min(1, session.elapsedSec / session.durationSec)
  const tp = totalPoints ?? 0
  // 生效皮肤：选中的若未解锁（如手改存储）则回退朴素；加载中(null)信任存储值避免闪烁
  const effectiveSkinId =
    totalPoints === null || isSkinUnlocked(skinId, totalPoints) ? skinId : 'plain'
  const CurrentSkin = getSkin(effectiveSkinId)

  if (session.phase === 'preparing') {
    return (
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '24px 20px 40px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>准备：{EYE_LABEL[session.eye]}</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>
          遮住另一只眼，拍子正镜片面朝眼，坐直、离屏幕约 40cm。
        </p>

        <div className="fq-card" style={{ marginTop: 18 }}>
          <label style={{ fontSize: 14, fontWeight: 600 }}>
            视标大小：<b style={{ color: 'var(--violet)' }}>{sizeMm.toFixed(1)} mm</b>
            <span style={{ color: 'var(--muted)', fontWeight: 400 }}>（≈ {acuityFromHeightMm(sizeMm).toFixed(2)} 视力）</span>
          </label>
          <input
            type="range"
            min={0.3}
            max={2}
            step={0.1}
            value={sizeMm}
            onChange={(e) => setSizeMm(Number(e.target.value))}
            style={{ width: '100%', marginTop: 12, accentColor: 'var(--violet)' }}
          />
          <div style={{ marginTop: 14, display: 'grid', placeItems: 'center', minHeight: 56 }}>
            <TumblingE direction="up" heightPx={sizeMm * pxPerMm} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>调到孩子能看清、但要努力的大小</p>
        </div>

        <div className="fq-card" style={{ marginTop: 14, textAlign: 'left' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>选择皮肤</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {SKINS.map((s) => {
              const unlocked = isSkinUnlocked(s.id, tp)
              const cost = skinUnlockCost(s.id)
              const sel = effectiveSkinId === s.id
              return (
                <button
                  key={s.id}
                  className="fq-btn"
                  onClick={() => { if (!unlocked) return; setSkinId(s.id); setSkinIdState(s.id) }}
                  disabled={!unlocked}
                  title={unlocked ? s.name : `练满 ${cost} 分解锁`}
                  style={{
                    background: sel ? 'var(--violet)' : '#fff',
                    color: sel ? '#fff' : 'var(--violet)',
                    borderColor: sel ? 'var(--violet)' : 'var(--line)',
                    opacity: unlocked ? 1 : 0.5,
                    cursor: unlocked ? 'pointer' : 'not-allowed',
                  }}
                >
                  {unlocked ? '' : '🔒 '}{s.name}
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
            ⭐ 累计 {tp} 分
            {(() => {
              const locked = SKINS.filter((s) => !isSkinUnlocked(s.id, tp))
              if (locked.length === 0) return ' · 皮肤已全部解锁 🎉'
              const nearest = Math.min(...locked.map((s) => skinUnlockCost(s.id)))
              return ` · 再练 ${nearest - tp} 分解锁新皮肤`
            })()}
          </div>
          <div style={{ maxWidth: 200, margin: '12px auto 0', borderRadius: 14, overflow: 'hidden' }}>
            <CurrentSkin.Stage target="up" heightPx={28} phase="showing" lastAnswer={null} isEgg={false} />
          </div>
        </div>

        <button className="fq-cta" style={{ width: '100%', marginTop: 16 }} onClick={beginSession}>▶ 开始</button>
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
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--violet)' }}>{Math.round(cpm(session.flips, session.elapsedSec))}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>CPM</div>
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 57px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
        <span className="fq-chip">{EYE_LABEL[session.eye]}</span>
        <div className="fq-bar" style={{ flex: 1 }}>
          <i style={{ width: `${progress * 100}%` }} />
        </div>
        <button className="fq-btn" style={{ padding: '7px 11px' }} onClick={() => setMutedState((m) => !m)}>
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
    </div>
  )
}
