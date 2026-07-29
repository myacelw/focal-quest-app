import { useEffect, useRef, useState } from 'react'
import { db } from '../data/db'
import { getHomeStats } from '../data/checkin'
import { toDateStr } from '../data/date-utils'
import { lsGet } from '../data/storage'
import { readSizeMm } from '../training/optotype-auto'
import { pickDirection } from '../training/session'
import { dirForKey } from '../training/key-map'
import { playSfx, setMuted } from '../training/sfx'
import type { Direction } from '../speech/answer-mapping'
import { getSkin, getSkinId, isSkinUnlocked, pickRandomSkin, RANDOM_SKIN_ID } from '../skins/registry'
import { useT, Rich } from '../i18n'
import { derivePace, challengeFlipMs, DEFAULT_PACE, PACE_SAMPLE_N, type Pace } from './challenge-pace'
import {
  createChallenge, startChallenge, answerChallenge, advanceChallenge, tickChallenge,
  type ChallengeState,
} from './challenge-session'
import { readBest, writeBestIfHigher } from './challenge-storage'
import { readPxPerMm } from '../calibration/px-per-mm'

/** 计时步长：训练页那套「1 秒粒度」在这里不够——挑战要在 ms 级判超时 */
const TICK_MS = 100
/** 单跳最多推进多少：标签页被 Safari 节流后回来时，别一口气吃掉整局 */
const MAX_TICK_DELTA_MS = 400
const ARROW: Record<Direction, string> = { up: '↑', down: '↓', left: '←', right: '→' }
const DPAD: { dir: Direction; col: number; row: number }[] = [
  { dir: 'up', col: 2, row: 1 },
  { dir: 'left', col: 1, row: 2 },
  { dir: 'right', col: 3, row: 2 },
  { dir: 'down', col: 2, row: 3 },
]


/**
 * 限时挑战页：30 秒冲分小游戏。与正经训练的关键区别——
 *   · 双眼不遮眼（binocular accommodative facility 本身就是标准训练项目）
 *   · 每题有答题窗口，超时不算错也不得分
 *   · 视标物理尺寸完全一致（毫米 × 标定），挑战调的是"给多少时间"不是"看多小的字"
 *   · 翻拍照旧要真翻，过渡时长强制不低于 600ms（challengeFlipMs）
 *   · 不给积分/勋章/怪兽、不进统计、不落 Dexie；最高分只写 localStorage
 * 外壳复用训练页的 .fzp-train / .fzp-stage / .fzp-answer 三段，手机竖屏自动适配。
 */
export function ChallengePage({ onBack }: { onBack: () => void }) {
  const t = useT()
  const [pace, setPace] = useState<Pace | null>(null)
  const [state, setState] = useState<ChallengeState | null>(null)
  const [best, setBest] = useState(() => readBest())
  const [record, setRecord] = useState<{ best: number; isNewRecord: boolean } | null>(null)
  const [muted, setMutedState] = useState(false)
  const [totalPoints, setTotalPoints] = useState<number | null>(null)
  const [randomSkinId, setRandomSkinId] = useState<string | null>(null)

  const stateRef = useRef<ChallengeState | null>(null)
  const lastTickRef = useRef(0)
  const savedRef = useRef(false)
  const handleAnswerRef = useRef<(d: Direction) => void>(() => {})

  const pxPerMm = readPxPerMm()
  // 医学边界②：翻拍过渡不得低于 600ms，统一从这一个出口拿
  const flipMs = challengeFlipMs(lsGet('fzp.flipMs') === null ? 900 : Number(lsGet('fzp.flipMs')))

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { setMuted(muted) }, [muted])

  // 节奏基准：读最近 PACE_SAMPLE_N 次训练的 avgReactionMs（**只读**，挑战不写任何表）。
  // sessions 没有 startedAtMs 索引，故沿用 StatsPage/badge-service 的全量 toArray 再排序
  // （家用数据量下无性能问题）；读失败就退回固定默认节奏，挑战照样能玩。
  useEffect(() => {
    let alive = true
    void (async () => {
      let p = DEFAULT_PACE
      try {
        const rows = await db.sessions.toArray()
        const recent = rows
          .slice()
          .sort((a, b) => b.startedAtMs - a.startedAtMs)
          .slice(0, PACE_SAMPLE_N)
        p = derivePace(recent.map((r) => r.avgReactionMs ?? 0))
      } catch {
        /* IndexedDB 不可用：用 DEFAULT_PACE（2000/1300） */
      }
      if (!alive) return
      setPace(p)
      setState(createChallenge(p))
    })()
    return () => { alive = false }
  }, [])

  // 皮肤解锁判定要累计分（与训练页同款只读逻辑，不打卡）
  useEffect(() => {
    void getHomeStats(toDateStr(new Date())).then((s) => setTotalPoints(s.totalPoints))
  }, [])

  useEffect(() => {
    if (getSkinId() === RANDOM_SKIN_ID && totalPoints !== null && randomSkinId === null) {
      setRandomSkinId(pickRandomSkin(totalPoints, Math.random()))
    }
  }, [totalPoints, randomSkinId])

  const running = state?.phase === 'showing' || state?.phase === 'transitioning'

  // 高频计时：100ms 一跳，且按**真实时间差**推进。
  // 训练页那套（1000ms 间隔 + tick(s,1) + 依赖 session.phase 重建 interval）在这里会走时
  // 不准：每次 showing↔transitioning 切换都丢掉未满一格的余量。这里 deps 只有 running
  // （整局只变两次），且 lastTickRef 在开局设一次、之后只被 interval 自己推进。
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      const now = Date.now()
      const delta = Math.min(now - lastTickRef.current, MAX_TICK_DELTA_MS)
      lastTickRef.current = now
      setState((s) => (s ? tickChallenge(s, delta) : s))
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [running])

  // 过渡调度：答题与超时两条路径都走这里（seq 每次离开 showing 都 +1，故每题只跑一次）。
  // 答题不再各自 setTimeout，超时也就不必另开一套——两路统一，翻拍时长只有一处。
  useEffect(() => {
    if (!state || state.phase !== 'transitioning' || !state.lastOutcome) return
    // 三种结局三种音效：超时**不能**用 'wrong'，那与 spec §4.5「超时=未答、不算错」矛盾，
    // 也会把结算页刚分开的"看错了 / 没跟上"在耳朵里重新糊成一团
    const k = state.lastOutcome.kind
    playSfx(k === 'correct' ? 'correct' : k === 'wrong' ? 'wrong' : 'timeout')
    const id = window.setTimeout(() => {
      playSfx('flip')
      setState((cur) =>
        cur && cur.phase === 'transitioning'
          ? advanceChallenge(cur, pickDirection(cur.target, Math.random()))
          : cur,
      )
    }, flipMs)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.seq, state?.phase, flipMs])

  // 结束：只写 localStorage 最高分（不落 Dexie、不打卡、不给积分/勋章/怪兽）
  useEffect(() => {
    if (!state || state.phase !== 'finished' || savedRef.current) return
    savedRef.current = true
    const r = writeBestIfHigher(state.score)
    setRecord(r)
    setBest(r.best)
    playSfx(r.isNewRecord ? 'badge' : 'finish')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.score])

  function handleAnswer(dir: Direction) {
    const s = stateRef.current
    if (!s || s.phase !== 'showing' || s.target === null) return
    setState(answerChallenge(s, dir))
  }
  handleAnswerRef.current = handleAnswer

  // 键盘作答：与训练页共用 dirForKey，deps [] + ref 避免每次渲染重绑监听
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /^(input|textarea|select)$/i.test(el.tagName)) return
      const dir = dirForKey(e.key)
      if (!dir) return
      e.preventDefault()
      handleAnswerRef.current(dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function begin() {
    if (!pace) return
    savedRef.current = false
    setRecord(null)
    lastTickRef.current = Date.now()
    setState(startChallenge(createChallenge(pace), pickDirection(null, Math.random())))
  }

  // 没标定过就没有物理尺寸可言（与训练页同一道闸门，复用同两条文案）
  if (pxPerMm === null) {
    return (
      <div className="fq-page" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 46 }}>📐</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginTop: 10 }}>{t('train.calibFirst')}</h2>
        <p style={{ color: 'var(--muted)', marginTop: 8, lineHeight: 1.6 }}>{t('train.calibFirstBody')}</p>
        <button className="fq-btn" style={{ marginTop: 18 }} onClick={onBack}>{t('challenge.back')}</button>
      </div>
    )
  }

  // 视标尺寸链与正经训练完全一致：毫米设定 × 屏幕标定（不因挑战而变）
  const sizeMm = readSizeMm()
  const heightPx = sizeMm * pxPerMm
  const storedSkinId = getSkinId()
  const skinId = storedSkinId === RANDOM_SKIN_ID ? (randomSkinId ?? 'plain') : storedSkinId
  const effectiveSkinId = totalPoints === null || isSkinUnlocked(skinId, totalPoints) ? skinId : 'plain'
  const CurrentSkin = getSkin(effectiveSkinId)

  if (!state || state.phase === 'ready') {
    return (
      <div className="fq-page">
        <h2 className="fq-h2">{t('challenge.title')}</h2>
        <p className="fq-sub">{t('challenge.sub')}</p>
        <div className="fq-card fq-rise" style={{ marginTop: 14 }}>
          <p style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>{t('challenge.ready')}</p>
          <p style={{ fontSize: 13, lineHeight: 1.7 }}><Rich text={t('challenge.readyHint')} /></p>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.6 }}>{t('challenge.paceHint')}</p>
          <p style={{ fontSize: 12, color: 'var(--coral)', marginTop: 8, fontWeight: 700 }}>{t('challenge.notTraining')}</p>
        </div>
        <div
          className="fq-card fq-rise"
          style={{ marginTop: 12, textAlign: 'center', fontWeight: 800, color: 'var(--violet)', animationDelay: '0.05s' }}
        >
          {best > 0 ? t('challenge.best', { n: best }) : t('challenge.noBest')}
        </div>
        <button className="fq-cta coral" style={{ width: '100%', marginTop: 16 }} disabled={!pace} onClick={begin}>
          {t('challenge.start')}
        </button>
        <button className="fq-btn" style={{ marginTop: 12 }} onClick={onBack}>{t('challenge.back')}</button>
      </div>
    )
  }

  if (state.phase === 'finished') {
    return (
      <div className="fq-page" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 50 }}>🏁</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{t('challenge.done')}</h2>
        <div
          className="fq-card"
          style={{ marginTop: 16, background: 'linear-gradient(135deg, #7c6cf0, #8b6cff)', border: 'none', color: '#fff', boxShadow: 'var(--shadow)' }}
        >
          <div style={{ fontSize: 42, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{state.score}</div>
          <div style={{ fontSize: 13, opacity: 0.92, marginTop: 2 }}>{t('challenge.score')}</div>
          {record?.isNewRecord && <div style={{ fontSize: 16, fontWeight: 800, marginTop: 10 }}>{t('challenge.newRecord')}</div>}
          <div style={{ fontSize: 13, opacity: 0.92, marginTop: 8 }}>{t('challenge.best', { n: best })}</div>
        </div>
        <div className="fq-card" style={{ marginTop: 12, display: 'flex' }}>
          <Tally value={state.correct} label={t('challenge.correctCount')} tint="var(--violet)" />
          <Tally value={state.wrong} label={t('challenge.wrongCount')} tint="var(--coral)" />
          <Tally value={state.timedOut} label={t('challenge.timeoutCount')} tint="var(--muted)" />
          <Tally value={state.bestStreak} label={t('challenge.bestStreak')} tint="var(--mint)" />
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>{t('challenge.notTraining')}</p>
        <button className="fq-cta coral" style={{ width: '100%', marginTop: 14 }} onClick={begin}>{t('challenge.again')}</button>
        <button className="fq-btn" style={{ marginTop: 12 }} onClick={onBack}>{t('challenge.back')}</button>
      </div>
    )
  }

  const remainSec = Math.ceil(Math.max(0, state.durationMs - state.elapsedMs) / 1000)
  const windowRatio = state.windowMs > 0 ? Math.max(0, Math.min(1, state.windowLeftMs / state.windowMs)) : 0
  const justTimedOut = state.phase === 'transitioning' && state.lastOutcome?.kind === 'timeout'
  // 皮肤的怪兽轮换与一次性演出都吃 lastAnswer.seq；超时也当一次"答错"演出（抖一下）
  const lastAnswer = state.lastOutcome
    ? { dir: state.lastOutcome.dir, correct: state.lastOutcome.kind === 'correct', seq: state.lastOutcome.seq }
    : null

  return (
    <div className="fzp-train">
      {/* 手机横屏才显示（纯 CSS 媒体查询控制，见 index.css:228）——与训练页同一口径：
          横屏不是目标形态，只保证不破版并提示"竖屏更好用"（CLAUDE.md 关键决策 #1） */}
      <div className="fzp-rotate-hint">{t('train.rotateHint')}</div>
      <div className="fzp-tiny-warn">{t('train.screenTooSmall')}</div>
      {/* 顶栏刻意与训练页同高（一行）：layout-budget 的 TOP_BAR_PX=45 是按一行算的 */}
      <div className="fzp-train-top">
        <span className="fq-chip" style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>⚡ {state.score}</span>
        {/* 进度条 = 本题答题窗口剩余（不是总时长）；.fq-bar > i 自带 0.6s 过渡，这里必须关掉 */}
        <div className="fq-bar" style={{ flex: 1 }}>
          <i style={{ width: `${windowRatio * 100}%`, transition: 'none' }} />
        </div>
        {/* 顶栏放不下"剩余"二字（多一个词就可能折行、TOP_BAR_PX=45 的预算即失效），
            故文案只走 aria-label：读屏能念出"剩余"，视觉上仍是纯数字 */}
        <span
          aria-label={t('challenge.time')}
          style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: 'var(--violet)', fontSize: 15, minWidth: 34, textAlign: 'right' }}
        >
          {remainSec}s
        </span>
        <button className="fq-btn" style={{ padding: '7px 10px' }} onClick={() => setMutedState((m) => !m)}>
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      <div className="fzp-stage">
        <CurrentSkin.Stage
          target={state.target}
          heightPx={heightPx}
          phase={state.phase === 'transitioning' ? 'transitioning' : 'showing'}
          lastAnswer={lastAnswer}
          isEgg={false}
          capturedReserveIds={[]}
        />
        {justTimedOut && (
          <div
            key={`timeout-${state.seq}`}
            style={{ position: 'absolute', top: '12%', left: '50%', fontSize: 26, fontWeight: 800, color: '#ff5c7a', textShadow: '0 2px 8px rgba(0,0,0,0.3)', animation: 'fzpCombo 0.9s ease-out forwards', pointerEvents: 'none', zIndex: 6, whiteSpace: 'nowrap' }}
          >
            {t('challenge.timeout')}
          </div>
        )}
        {/* 翻拍引导：与训练页同款柔和渐变光晕 + 优雅翻一次 + 紫→珊瑚进度条（皮肤无关） */}
        {state.phase === 'transitioning' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
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

      <div className="fzp-answer">
        {/* 挑战不接语音（见文件头决策注），这一格放免责文案 */}
        <span className="fzp-voice-hint">{t('challenge.notTraining')}</span>
        <div className="fq-dpad">
          {DPAD.map(({ dir, col, row }) => (
            <button
              key={dir}
              className="fq-dpad-btn"
              aria-label={t(`direction.${dir}`)}
              onClick={() => handleAnswer(dir)}
              style={{ gridColumn: col, gridRow: row }}
            >
              {ARROW[dir]}
            </button>
          ))}
          <div className="fq-dpad-hub" style={{ gridColumn: 2, gridRow: 2 }}><i /></div>
        </div>
        <span className="fzp-answer-spacer" aria-hidden />
      </div>
    </div>
  )
}

/** 结算页的一格计数（答对 / 答错 / 超时 / 最长连击） */
function Tally({ value, label, tint }: { value: number; label: string; tint: string }) {
  return (
    <div style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: tint, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
    </div>
  )
}
