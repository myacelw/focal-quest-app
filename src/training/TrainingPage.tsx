import { useEffect, useRef, useState } from 'react'
import { acuityFromHeightMm } from './optotype-size'
import {
  createSession, pickDirection, start, answer, advance, tick, accuracy,
  type SessionState,
} from './session'
import { playSfx, setMuted } from './sfx'
import { startVosk, type VoskController } from '../speech/vosk'
import { parseAnswer, type Direction } from '../speech/answer-mapping'
import { saveSession, doCheckIn, getHomeStats, type CheckinResult } from '../data/checkin'
import { toDateStr } from '../data/date-utils'
import { lsGet } from '../data/storage'
import { asset } from '../data/asset'
import { useT } from '../i18n'
import { syncBadges } from '../badges/badge-service'
import type { BadgeDef } from '../badges/badge-defs'
import { getSkin, getSkinId, isSkinUnlocked, newlyUnlockedSkins } from '../skins/registry'
import type { Skin } from '../skins/types'
import { captureMonster, captureDailyOnCheckin, getOwnedReserveIdsByWorld } from '../dex/dex-service'
import type { MonsterDef, World, Rarity } from '../dex/monster-defs'
import { MonsterImage } from '../dex/MonsterImage'

const DURATION_SEC = 180
const TRANSITION_MS = 900
const VOSK_MODEL_URL = asset('/models/vosk-model-small-cn-0.22.tar.gz')
const VOSK_GRAMMAR = ['上 下 左 右']
const ARROW: Record<Direction, string> = { up: '↑', down: '↓', left: '←', right: '→' }

function readPxPerMm(): number | null {
  const v = lsGet('fzp.cssPxPerMm')
  return v ? Number(v) : null
}

function readDurationSec(): number {
  const v = lsGet('fzp.durationSec')
  return v ? Number(v) : DURATION_SEC
}

// 翻拍过渡时长（ms）：给孩子留出物理翻拍的时间，设置页可调（快/适中/慢）
function readFlipMs(): number {
  const v = lsGet('fzp.flipMs')
  return v ? Number(v) : TRANSITION_MS
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
  const [comboFx, setComboFx] = useState<{ n: number; key: number } | null>(null)
  // 怪兽图鉴：训练中彩蛋答对触发捕获，结算页保底捕获；本节捕获列表用于开箱
  const [eggCaptureFx, setEggCaptureFx] = useState<{ key: number } | null>(null)
  const [capturedThisSession, setCapturedThisSession] = useState<MonsterDef[]>([])
  // 皮肤池联动：按世界分组的已捕获储备怪 id，传给 Stage 扩展轮换池
  const [capturedByWorld, setCapturedByWorld] = useState<Record<World, string[]>>({ space: [], shrine: [] })

  const t = useT()
  const pxPerMm = readPxPerMm()
  const flipMs = readFlipMs()
  const eyeLabel = session.eye === 'left' ? t('train.eyeLeft') : t('train.eyeRight')
  const sessionRef = useRef(session)
  const voskRef = useRef<VoskController | null>(null)
  const savedRef = useRef(false)
  const sizeMmRef = useRef(1)
  const seqRef = useRef(0)
  const targetShownAtRef = useRef(0)
  const sumReactionRef = useRef(0)
  const reactionCountRef = useRef(0)
  const pausedRef = useRef(false)
  const handleAnswerRef = useRef<(d: Direction) => void>(() => {})

  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { setMuted(muted) }, [muted])

  useEffect(() => { pausedRef.current = paused }, [paused])

  // 彩蛋捕获角标 1.2s 自动消失（不阻断翻拍节奏）
  useEffect(() => {
    if (!eggCaptureFx) return
    const id = window.setTimeout(() => setEggCaptureFx(null), 1200)
    return () => window.clearTimeout(id)
  }, [eggCaptureFx])

  // 读已捕获储备怪（用于皮肤池联动）；进训练页一次即可
  useEffect(() => {
    void getOwnedReserveIdsByWorld().then(setCapturedByWorld)
  }, [])

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

  // 进入准备阶段后自动开始（留 1.5s 遮眼时间），免去再点一次"开始"
  useEffect(() => {
    if (session.phase !== 'preparing') return
    const t = window.setTimeout(() => beginSession(), 1500)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.phase])

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
    if (right && s.correctStreak + 1 >= 3) setComboFx({ n: s.correctStreak + 1, key: seqRef.current })
    setLastAnswer({ dir, correct: right, seq: seqRef.current })
    setSession(answer(s, dir))
    // 彩蛋答对触发捕获：触发瞬间抽定并落库，正式揭晓在结算页开箱区。
    // 不阻断翻拍节奏——只飘一个不阻断的小角标。
    if (s.isEgg && right) {
      const todayStr = toDateStr(new Date())
      const now = Date.now()
      void captureMonster('egg', todayStr, now).then((m) => {
        if (!m) return
        setCapturedThisSession((arr) => [...arr, m])
        setEggCaptureFx({ key: seqRef.current })
        // 储备怪（rarity !== common）加入对应世界的轮换池
        if (m.rarity !== 'common') {
          setCapturedByWorld((prev) => ({ ...prev, [m.world]: [...prev[m.world], m.id] }))
        }
      })
    }
    window.setTimeout(() => {
      playSfx('flip')
      setSession((cur) =>
        cur.phase === 'transitioning'
          ? advance(cur, pickDirection(cur.target, Math.random()))
          : cur,
      )
    }, flipMs)
  }
  handleAnswerRef.current = handleAnswer

  // 键盘作答：方向键最直观；1-4 / asdf / jkl; 按屏幕按钮顺序(上下左右)映射，方便单手/无语音时用。
  // 若将来出现数字视标，同样把 1-9 对到对应选项即可。
  useEffect(() => {
    const KEY_MAP: Record<string, Direction> = {
      arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
      '1': 'up', '2': 'down', '3': 'left', '4': 'right',
      a: 'up', s: 'down', d: 'left', f: 'right',
      j: 'up', k: 'down', l: 'left', ';': 'right',
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && /^(input|textarea|select)$/i.test(t.tagName)) return
      const dir = KEY_MAP[e.key.toLowerCase()]
      if (!dir) return
      e.preventDefault()
      handleAnswerRef.current(dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
      const todayStr = toDateStr(new Date())
      const result = await doCheckIn(todayStr)
      const unlocked = await syncBadges(Date.now())
      // 保底捕获：当天首次完成训练打卡时必得 1 只新怪兽
      let dailyCaptured: MonsterDef | null = null
      if (!result.alreadyCheckedIn) {
        dailyCaptured = await captureDailyOnCheckin(false, todayStr, Date.now())
        if (dailyCaptured) {
          setCapturedThisSession((arr) => [...arr, dailyCaptured!])
          if (dailyCaptured.rarity !== 'common') {
            setCapturedByWorld((prev) => ({ ...prev, [dailyCaptured!.world]: [...prev[dailyCaptured!.world], dailyCaptured!.id] }))
          }
        }
      }
      const prevPoints = result.alreadyCheckedIn ? result.totalPoints : result.totalPoints - result.dailyPoints
      const skins = newlyUnlockedSkins(prevPoints, result.totalPoints)
      // 任何"额外收获"都用 badge 音效，纯打卡用 checkin
      playSfx(unlocked.length > 0 || skins.length > 0 || dailyCaptured ? 'badge' : 'checkin')
      setNewBadges(unlocked)
      setNewSkins(skins)
      setCheckin(result)
    }
  }

  if (pxPerMm === null) {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '48px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 46 }}>📐</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginTop: 10 }}>{t('train.calibFirst')}</h2>
        <p style={{ color: 'var(--muted)', marginTop: 8, lineHeight: 1.6 }}>
          {t('train.calibFirstBody')}
        </p>
      </div>
    )
  }

  if (checkin) {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 54 }}>{checkin.alreadyCheckedIn ? '✓' : '🎉'}</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
          {checkin.alreadyCheckedIn ? t('train.checkedAlready') : t('train.checkedSuccess')}
        </h2>
        <div
          className="fq-card"
          style={{ marginTop: 18, background: 'linear-gradient(135deg,#ff8a5b,#ff5c86)', border: 'none', color: '#fff', boxShadow: 'var(--shadow-coral)' }}
        >
          <div style={{ fontSize: 22, fontWeight: 800 }}>{t('train.streakDays', { n: checkin.streak })}</div>
          {!checkin.alreadyCheckedIn && <div style={{ fontSize: 14, marginTop: 8, opacity: 0.95 }}>{t('train.todayPoints', { n: checkin.dailyPoints })}</div>}
          <div style={{ fontSize: 14, marginTop: 6, opacity: 0.95 }}>{t('train.totalPoints', { n: checkin.totalPoints })}</div>
        </div>
        {newBadges.length > 0 && (
          <div className="fq-card" style={{ marginTop: 14 }}>
            <p style={{ fontWeight: 700, marginBottom: 12 }}>{t('train.newBadge')}</p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              {newBadges.map((b) => (
                <div key={b.id} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 34 }}>{b.emoji}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{t(`badge.${b.id}`)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {newSkins.length > 0 && (
          <div className="fq-card" style={{ marginTop: 14 }}>
            <p style={{ fontWeight: 700, marginBottom: 12 }}>{t('train.newSkin')}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {newSkins.map((s) => (
                <span key={s.id} className="fq-chip" style={{ background: '#fff9e6', color: '#b8860b', border: '1.5px solid var(--lemon)' }}>
                  {t(`skin.${s.id}`)}
                </span>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>{t('train.trySkinHint')}</p>
          </div>
        )}
        {/* 怪兽图鉴开箱区：本节捕获（彩蛋 + 保底）逐只翻牌揭晓，配音效 */}
        {capturedThisSession.length > 0 && (
          <div className="fq-card" style={{ marginTop: 14 }}>
            <p style={{ fontWeight: 700, marginBottom: 12 }}>{t('dex.openBox')}</p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              {capturedThisSession.map((m, i) => (
                <CapturedMonsterReveal key={`${m.id}-${i}`} def={m} delayMs={i * 500} />
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>{t('dex.empty')}</p>
          </div>
        )}
      </div>
    )
  }

  const sizeMm = Number(lsGet('fzp.optotypeSizeMm') ?? '1')
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
        <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 10 }}>{t('train.ready')}</h2>
        <div
          className="fq-card"
          style={{ marginTop: 18, background: 'linear-gradient(135deg, #7c6cf0, #8b6cff)', border: 'none', color: '#fff', boxShadow: 'var(--shadow)' }}
        >
          <div style={{ fontSize: 19, fontWeight: 800 }}>{eyeLabel}</div>
          <p style={{ fontSize: 13, opacity: 0.92, marginTop: 8, lineHeight: 1.6 }}>{t('train.prepHint')}</p>
        </div>
        <p style={{ fontSize: 15, color: 'var(--violet)', fontWeight: 800, marginTop: 22 }}>{t('train.getReady')}</p>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>{t('train.configHint')}</p>
      </div>
    )
  }

  if (session.phase === 'finished') {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 50 }}>🎊</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
          {t('train.sessionDone', { eye: session.eye === 'left' ? t('train.eyeLeftShort') : t('train.eyeRightShort') })}
        </h2>
        <div className="fq-card" style={{ marginTop: 18, display: 'flex', justifyContent: 'space-around' }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--violet)' }}>{session.correct}/{session.answered}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{t('train.correctLabel')}</div>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--violet)' }}>{Math.round(accuracy(session) * 100)}%</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{t('stats.accuracy')}</div>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--violet)' }}>
              {reactionCountRef.current ? (sumReactionRef.current / reactionCountRef.current / 1000).toFixed(1) : '—'}
              <span style={{ fontSize: 14 }}>s</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{t('stats.avgReaction')}</div>
          </div>
        </div>
        <button className="fq-cta coral" style={{ width: '100%', marginTop: 16 }} onClick={nextEyeOrFinish}>
          {session.eye === 'left' ? t('train.nextEye') : t('train.finishCheckin')}
        </button>
      </div>
    )
  }

  const voskHint =
    voskStatus === 'loading' ? t('train.voiceLoading')
    : voskStatus === 'ready' ? t('train.voiceReady')
    : voskStatus === 'failed' ? t('train.voiceFailed')
    : t('train.voiceButtons')

  const remainSec = Math.max(0, session.durationSec - session.elapsedSec)
  const mmss = `${Math.floor(remainSec / 60)}:${String(remainSec % 60).padStart(2, '0')}`

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 57px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
        <span className="fq-chip">{eyeLabel}</span>
        <div className="fq-bar" style={{ flex: 1 }}>
          <i style={{ width: `${progress * 100}%` }} />
        </div>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: 'var(--violet)', fontSize: 15, minWidth: 40, textAlign: 'right' }}>{mmss}</span>
        <button className="fq-btn" style={{ padding: '7px 10px' }} onClick={() => setPaused(true)} aria-label={t('train.pause')}>⏸️</button>
        <button className="fq-btn" style={{ padding: '7px 10px' }} onClick={() => setMutedState((m) => !m)}>
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0', position: 'relative' }}>
        <CurrentSkin.Stage
          target={session.target}
          heightPx={heightPx}
          phase={session.phase === 'transitioning' ? 'transitioning' : 'showing'}
          lastAnswer={lastAnswer}
          isEgg={session.isEgg}
          capturedReserveIds={effectiveSkinId === 'space' ? capturedByWorld.space : effectiveSkinId === 'shrine' ? capturedByWorld.shrine : []}
        />
        {comboFx && (
          <div
            key={comboFx.key}
            style={{ position: 'absolute', top: '12%', left: '50%', fontSize: 28, fontWeight: 800, color: '#ff5c7a', textShadow: '0 2px 8px rgba(0,0,0,0.3)', animation: 'fzpCombo 0.9s ease-out forwards', pointerEvents: 'none', zIndex: 6, whiteSpace: 'nowrap' }}
          >
            {t('train.combo', { n: comboFx.n })}
          </div>
        )}
        {/* 彩蛋捕获角标：不阻断翻拍节奏，仅飘一个「📖 新怪兽！」提示 */}
        {eggCaptureFx && (
          <div
            key={`egg-${eggCaptureFx.key}`}
            className="fzp-dex-toast"
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              fontSize: 14,
              fontWeight: 800,
              color: '#fff',
              background: 'linear-gradient(135deg, var(--violet), var(--coral))',
              padding: '8px 14px',
              borderRadius: 99,
              boxShadow: 'var(--shadow)',
              animation: 'fzpDexToast 1.2s ease-out forwards',
              pointerEvents: 'none',
              zIndex: 6,
              whiteSpace: 'nowrap',
            }}
          >
            {t('dex.newCapture')}
          </div>
        )}
        {session.phase === 'transitioning' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              // 柔和的糖果渐变光晕，融进画面、轻推背景，而非不透明糊屏
              background: 'radial-gradient(circle at 50% 46%, rgba(108,75,240,0.13), rgba(255,138,138,0.05) 46%, transparent 72%)',
              backdropFilter: 'blur(2.5px)',
            }}
          >
            <div style={{ textAlign: 'center', animation: 'fzpGuideIn 0.35s cubic-bezier(0.2,0.8,0.2,1) both' }}>
              <div
                className="fzp-flip-icon"
                style={{ fontSize: 68, animation: `fzpFlip3d ${flipMs}ms ease-in-out infinite`, filter: 'drop-shadow(0 4px 10px rgba(108,75,240,0.28))' }}
              >
                🔄
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--violet)', marginTop: 8, letterSpacing: 1, textShadow: '0 1px 6px rgba(255,255,255,0.85)' }}>
                {t('train.flip')}
              </div>
              <div style={{ width: 168, height: 7, background: 'rgba(108,75,240,0.15)', borderRadius: 99, margin: '16px auto 0', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--violet), var(--coral))', borderRadius: 99, animation: `fzpFlipBar ${flipMs}ms linear forwards` }} />
              </div>
            </div>
          </div>
        )}
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
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>{t('train.paused')}</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>{t('train.pausedRemain', { t: mmss })}</p>
            <button className="fq-cta" style={{ width: '100%', marginTop: 14 }} onClick={() => setPaused(false)}>{t('train.resume')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** 稀有度 → 边框色（普通银灰、稀有紫、史诗金） */
const RARITY_BORDER: Record<Rarity, string> = {
  common: '#c7c0db',
  rare: '#7c6cf0',
  epic: '#ffb400',
}

/** 结算页开箱：本节捕获的怪兽逐只翻牌揭晓，配音效 */
function CapturedMonsterReveal({ def, delayMs }: { def: MonsterDef; delayMs: number }) {
  const t = useT()
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => {
      setRevealed(true)
      // 复用现有音效：史诗/稀有用 badge（金光感），普通用 egg（彩蛋感）
      playSfx(def.rarity === 'common' ? 'egg' : 'badge')
    }, delayMs)
    return () => window.clearTimeout(id)
  }, [delayMs, def.rarity])

  return (
    <div style={{ textAlign: 'center' }}>
      <div
        className="fzp-dex-reveal"
        style={{
          width: 96,
          height: 96,
          margin: '0 auto',
          borderRadius: 14,
          border: `2px solid ${RARITY_BORDER[def.rarity]}`,
          background: revealed ? '#fff' : 'linear-gradient(135deg, var(--violet), var(--coral))',
          overflow: 'hidden',
          transition: 'transform 0.4s cubic-bezier(0.2,0.8,0.2,1)',
          transform: revealed ? 'scale(1)' : 'scale(0.85)',
          animation: revealed ? 'none' : 'fzpFloat 2.6s ease-in-out infinite',
        }}
      >
        {revealed ? (
          <MonsterImage def={def} />
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', fontSize: 36, color: '#fff' }}>❓</div>
        )}
      </div>
      <div style={{ fontSize: 13, marginTop: 6, fontWeight: 700, color: 'var(--ink)' }}>
        {revealed ? t(def.nameKey) : '？？？'}
      </div>
      <div style={{ fontSize: 11, marginTop: 2, color: RARITY_BORDER[def.rarity] }}>
        {revealed ? t(`dex.rarity.${def.rarity}`) : ''}
      </div>
    </div>
  )
}
