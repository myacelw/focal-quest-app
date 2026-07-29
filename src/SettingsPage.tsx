import { useEffect, useRef, useState } from 'react'
import { TumblingE } from './training/TumblingE'
import { acuityFromHeightMm } from './training/optotype-size'
import { getHomeStats } from './data/checkin'
import { lsGet, lsSet } from './data/storage'
import {
  readSizeMm, LS_SIZE,
  readAutoEnabled, writeAutoEnabled, readLastAdjust, writeLastAdjust, type OptotypeAdjust,
} from './training/optotype-auto'
import { toDateStr } from './data/date-utils'
import { getSkin, getSkinId, setSkinId, isSkinUnlocked, skinUnlockCost, SKINS } from './skins/registry'
import { useT, useLang, setLang, type Lang, Rich } from './i18n'
import { RewardConfig } from './rewards/RewardConfig'
import { ExamConfig } from './exams/ExamConfig'
import { BackupCard } from './backup/BackupCard'
import { ReminderCard } from './reminder/ReminderCard'
import { ResetCard } from './reset/ResetCard'
import { Collapsible, SectionHeader } from './settings/Collapsible'
import { CloudSyncCard } from './sync/CloudSyncCard'
import { getAccount } from './sync/account'
import { goalPerRound, sanitizeDurationSec, GOAL_CORRECT_PER_MIN } from './training/goal'

function readPxPerMm(): number | null {
  const v = lsGet('fzp.cssPxPerMm')
  return v ? Number(v) : null
}

/** 家长设置页：所有训练配置集中在此，配一次即可，孩子训练路径不再碰这些 */
export function SettingsPage({ onReplayGuide, onOpenSpeech, onOpenCalib, onOpenPrivacy, onOpenAdmin }: { onReplayGuide: () => void; onOpenSpeech: () => void; onOpenCalib: () => void; onOpenPrivacy: () => void; onOpenAdmin: () => void }) {
  const t = useT()
  const lang = useLang()
  // 传函数引用做惰性初始化——只在挂载时调一次 readSizeMm()，不要写成 useState(readSizeMm())
  // 那样每次渲染都会立即调用一次，白白多做一次 localStorage 读取。
  const [sizeMm, setSizeMm] = useState(readSizeMm)
  const [autoOn, setAutoOn] = useState(readAutoEnabled)
  const [lastAdjust, setLastAdjust] = useState(readLastAdjust)
  // 时长口径只有一个出处：脏值（'abc'→NaN、'0'→0）在这里就被兜成默认 180，
  // 否则下面的门槛提示会显示成"× NaN 分钟"，四个档位按钮也会全都不高亮。
  // Number(null) 是 0，同样被 sanitize 兜成 180，与改动前行为一致。
  const [durationSec, setDurationSec] = useState(() => sanitizeDurationSec(Number(lsGet('fzp.durationSec'))))
  const [flipperD, setFlipperD] = useState(() => {
    const v = lsGet('fzp.flipperD')
    return v ? Number(v) : 2
  })
  const [flipMs, setFlipMs] = useState(() => {
    const v = lsGet('fzp.flipMs')
    return v ? Number(v) : 900
  })
  const [skinId, setSkinIdState] = useState(() => getSkinId())
  const [totalPoints, setTotalPoints] = useState<number | null>(null)
  // 管理后台入口：**只有 is_admin 账号才渲染**，其余人连这张卡都看不见。
  // 注意这份 isAdmin 是登录响应写进 syncMeta 的快照——在 D1 里改完 is_admin 要重新登录一次才生效。
  const [isAdmin, setIsAdmin] = useState(false)
  // 账号变动计数：云同步卡就嵌在本页，页内登录不会让本组件重新挂载，
  // 靠它把 isAdmin 重读一次，否则管理入口要切走再回来才出现。
  const [accountRev, setAccountRev] = useState(0)

  useEffect(() => {
    void getHomeStats(toDateStr(new Date())).then((s) => setTotalPoints(s.totalPoints))
  }, [])
  useEffect(() => { void getAccount().then((a) => setIsAdmin(a?.isAdmin === true)) }, [accountRev])
  // 手动改动要写一条 kind:'manual' 的记录——它不参与判据，只起"重置冷却"的作用：
  // 家长刚把视标调大（比如孩子那天状态不好），自动逻辑第二天又压回去就是跟家长对着干。
  const firstSizeRender = useRef(true)
  useEffect(() => {
    lsSet(LS_SIZE, String(sizeMm))
    if (firstSizeRender.current) { firstSizeRender.current = false; return }
    const rec: OptotypeAdjust = {
      from: lastAdjust?.to ?? sizeMm, to: sizeMm,
      atDate: toDateStr(new Date()), kind: 'manual', baselineReactionMs: 0,
    }
    writeLastAdjust(rec)
    setLastAdjust(rec)
  }, [sizeMm])
  useEffect(() => { lsSet('fzp.durationSec', String(durationSec)) }, [durationSec])
  useEffect(() => { lsSet('fzp.flipperD', String(flipperD)) }, [flipperD])
  useEffect(() => { lsSet('fzp.flipMs', String(flipMs)) }, [flipMs])

  const pxPerMm = readPxPerMm()
  const tp = totalPoints ?? 0
  const effectiveSkinId = totalPoints === null || isSkinUnlocked(skinId, totalPoints) ? skinId : 'plain'
  const CurrentSkin = getSkin(effectiveSkinId)

  return (
    <div className="fq-page fq-rise">
      <h2 className="fq-h2">{t('settings.title')}</h2>
      <p className="fq-sub">{t('settings.sub')}</p>

      <SectionHeader>{t('settings.group.training')}</SectionHeader>

      <div className="fq-card" style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="fq-card-title" style={{ marginBottom: 4 }}>{t('settings.calib')}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {pxPerMm !== null ? t('settings.calibDone', { v: pxPerMm.toFixed(1) }) : t('settings.calibTodo')}
          </div>
        </div>
        <button className="fq-btn" onClick={onOpenCalib}>{pxPerMm !== null ? t('settings.recalib') : t('settings.goCalib')}</button>
      </div>

      {/* 「影响训练量与难度」的两项收进折叠区（spec §7.7，用户 2026-07-27 拍板）。
          ⚠️ 定性是**降低可达性，不是权限闸门**：孩子展开一样能改，这是已知且接受的。
          为什么要折：训练完成门槛按时长**等比缩放**（医学口径不可动摇——固定门槛会惩罚
          调节慢的孩子，而那正是最该练的），代价就是"把单眼时长点到 1 分 → 训练量与门槛
          一起砍到 1/3"。「练完之后」改档追溯降低当天门槛那一半已由 goalForDay 堵死
          （spec §3.5）；「练之前就调低」这一半门槛堵不住，只能靠可达性。视标大小同理
          （调大 = 变简单，且它直接决定训练的医学有效性）。
          只折这两项：标定首次必做（藏起来会让新用户卡住）、翻拍速度只改节奏观感、
          拍子度数软件只记录不参与计算、皮肤是给孩子的奖励本该显眼——判据是
          "改了会不会改变训练量或难度"。锚定见 src/settings/settings-fold.test.ts。
          实现两个坑：①不传 defaultOpen（传 true 等于什么都没做）；
          ②内层两块不再套 className="fq-card"（Collapsible 自身就是一张卡，套娃出双层圆角与内边距）。 */}
      <Collapsible title={t('settings.trainingLoad')}>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          {t('settings.trainingLoadHint')}
        </p>

        <div>
          <div className="fq-card-title">{t('settings.optotype')}</div>
          {pxPerMm !== null ? (
            <>
              <div style={{ fontSize: 14 }}>
                <b style={{ color: 'var(--violet)' }}>{sizeMm.toFixed(1)} mm</b>
                <span style={{ color: 'var(--muted)' }}>{t('settings.acuity', { v: acuityFromHeightMm(sizeMm).toFixed(2) })}</span>
              </div>
              <input
                type="range"
                min={0.3}
                max={2}
                step={0.1}
                value={sizeMm}
                onChange={(e) => setSizeMm(Number(e.target.value))}
                style={{ width: '100%', marginTop: 10, accentColor: 'var(--violet)' }}
              />
              <div style={{ marginTop: 12, display: 'grid', placeItems: 'center', minHeight: 56, color: 'var(--ink)' }}>
                <TumblingE direction="up" heightPx={sizeMm * pxPerMm} />
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{t('settings.optotypeHint')}</p>
            </>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('settings.optotypeNeedCalib')}</p>
          )}
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{t('optoAuto.switch')}</span>
            <input
              type="checkbox"
              checked={autoOn}
              onChange={(e) => { setAutoOn(e.target.checked); writeAutoEnabled(e.target.checked) }}
              style={{ width: 20, height: 20, accentColor: 'var(--violet)' }}
            />
          </label>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, lineHeight: 1.6 }}>{t('optoAuto.switchHint')}</p>

          {lastAdjust && lastAdjust.kind !== 'manual' && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {t('optoAuto.lastAdjust', {
                  date: lastAdjust.atDate, from: lastAdjust.from.toFixed(1), to: lastAdjust.to.toFixed(1),
                })}
              </span>
              <button
                onClick={() => { setSizeMm(lastAdjust.from) }}
                style={{
                  fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 99,
                  border: '1px solid var(--line)', background: 'transparent',
                  color: 'var(--violet)', cursor: 'pointer',
                }}
              >
                {t('optoAuto.undo')}
              </button>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{t('settings.duration')}</span>
          <div className="fq-seg">
            {[60, 120, 180, 300].map((sec) => (
              <button key={sec} className={durationSec === sec ? 'on' : ''} onClick={() => setDurationSec(sec)}>
                {sec / 60}{t('settings.minute')}
              </button>
            ))}
          </div>
          {/* 家长唯一能看到门槛数值的地方——孩子说"我练了但没打上卡"时得有处可查。
              这行说的是「按当前档位一天要答对几个」，不是"今天实际的门槛"：若今天已练过更长
              的一节，当天真实门槛按那节算（goalForDay，spec §3.5），首页第三态显示的才是它。 */}
          <p style={{ flexBasis: '100%', margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            {t('goal.settingsHint', { n: goalPerRound(durationSec), per: GOAL_CORRECT_PER_MIN, min: sanitizeDurationSec(durationSec) / 60 })}
          </p>
        </div>
      </Collapsible>

      <div className="fq-card" style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{t('settings.flipSpeed')}</span>
        <div className="fq-seg">
          {[{ ms: 600, k: 'settings.flipFast' }, { ms: 900, k: 'settings.flipMid' }, { ms: 1500, k: 'settings.flipSlow' }].map((o) => (
            <button key={o.ms} className={flipMs === o.ms ? 'on' : ''} onClick={() => setFlipMs(o.ms)}>
              {t(o.k)}
            </button>
          ))}
        </div>
      </div>

      <div className="fq-card" style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{t('settings.flipperD')}</span>
        <div className="fq-seg">
          {[1.5, 2, 2.5].map((d) => (
            <button key={d} className={flipperD === d ? 'on' : ''} onClick={() => setFlipperD(d)}>
              ±{d.toFixed(2)}
            </button>
          ))}
        </div>
      </div>

      <div className="fq-card" style={{ marginTop: 14 }}>
        <div className="fq-card-title">{t('settings.skin')}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SKINS.map((s) => {
            const unlocked = isSkinUnlocked(s.id, tp)
            const cost = skinUnlockCost(s.id)
            const sel = effectiveSkinId === s.id
            return (
              <button
                key={s.id}
                className="fq-btn"
                disabled={!unlocked}
                title={unlocked ? t(`skin.${s.id}`) : t('settings.skinLocked', { n: cost })}
                onClick={() => { if (!unlocked) return; setSkinId(s.id); setSkinIdState(s.id) }}
                style={{
                  background: sel ? 'var(--violet)' : '#fff',
                  color: sel ? '#fff' : 'var(--violet)',
                  borderColor: sel ? 'var(--violet)' : 'var(--line)',
                  opacity: unlocked ? 1 : 0.5,
                  cursor: unlocked ? 'pointer' : 'not-allowed',
                }}
              >
                {unlocked ? '' : '🔒 '}{t(`skin.${s.id}`)}
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
          {t('settings.skinTotal', { n: tp })}
          {(() => {
            const locked = SKINS.filter((s) => !isSkinUnlocked(s.id, tp))
            if (locked.length === 0) return t('settings.skinAllUnlocked')
            const nearest = Math.min(...locked.map((s) => skinUnlockCost(s.id)))
            return t('settings.skinNeedMore', { n: nearest - tp })
          })()}
        </div>
        <div style={{ maxWidth: 200, margin: '12px auto 0', borderRadius: 14, overflow: 'hidden' }}>
          <CurrentSkin.Stage target="up" heightPx={28} phase="showing" lastAnswer={null} isEgg={false} />
        </div>
      </div>

      <SectionHeader>{t('settings.group.rewards')}</SectionHeader>
      <Collapsible title={t('reward.config')}><RewardConfig /></Collapsible>
      <Collapsible title={t('reminder.title')}><ReminderCard /></Collapsible>

      <SectionHeader>{t('settings.group.data')}</SectionHeader>
      <Collapsible title={t('exam.title')}><ExamConfig /></Collapsible>
      <Collapsible title={t('backup.title')}><BackupCard /></Collapsible>
      <Collapsible title={t('reset.title')} danger><ResetCard /></Collapsible>

      <SectionHeader>{t('settings.group.cloud')}</SectionHeader>
      <Collapsible title={t('sync.title')}>
        <CloudSyncCard onOpenPrivacy={onOpenPrivacy} onAccountChange={() => setAccountRev((n) => n + 1)} />
      </Collapsible>

      {isAdmin && (
        <div className="fq-card" style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="fq-card-title" style={{ marginBottom: 4 }}>{t('admin.entry')}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('admin.sub')}</div>
          </div>
          <button className="fq-btn" onClick={onOpenAdmin}>{t('admin.open')}</button>
        </div>
      )}

      <SectionHeader>{t('settings.group.other')}</SectionHeader>

      <div className="fq-card" style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{t('settings.language')}</span>
        <div className="fq-seg">
          {([['zh', '中文'], ['en', 'English']] as [Lang, string][]).map(([code, label]) => (
            <button key={code} className={lang === code ? 'on' : ''} onClick={() => setLang(code)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="fq-card" style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{t('settings.guide')}</span>
        <button className="fq-btn" onClick={onReplayGuide}>{t('settings.replayGuide')}</button>
      </div>

      <div className="fq-card" style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{t('settings.speechTest')}</span>
        <button className="fq-btn" onClick={onOpenSpeech}>{t('settings.speechOpen')}</button>
      </div>

      <Collapsible title={t('settings.about')}>
        <ul style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.75, paddingLeft: 18, margin: 0 }}>
          <li><Rich text={t('settings.about.li1')} /></li>
          <li><Rich text={t('settings.about.li2')} /></li>
          <li><Rich text={t('settings.about.li3')} /></li>
          <li><Rich text={t('settings.about.li4')} /></li>
        </ul>
      </Collapsible>

      <p style={{ textAlign: 'center', marginTop: 20, color: 'var(--muted)', fontSize: 11 }}>
        {t('settings.version', { v: __APP_VERSION__ })}
      </p>
    </div>
  )
}
