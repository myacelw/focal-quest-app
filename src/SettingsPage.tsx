import { useEffect, useState } from 'react'
import { TumblingE } from './training/TumblingE'
import { acuityFromHeightMm } from './training/optotype-size'
import { getHomeStats } from './data/checkin'
import { lsGet, lsSet } from './data/storage'
import { toDateStr } from './data/date-utils'
import { getSkin, getSkinId, setSkinId, isSkinUnlocked, skinUnlockCost, SKINS } from './skins/registry'
import { useT, useLang, setLang, type Lang, Rich } from './i18n'
import { RewardConfig } from './rewards/RewardConfig'
import { ExamConfig } from './exams/ExamConfig'
import { BackupCard } from './backup/BackupCard'
import { ReminderCard } from './reminder/ReminderCard'
import { ResetCard } from './reset/ResetCard'
import { Collapsible, SectionHeader } from './settings/Collapsible'

function readPxPerMm(): number | null {
  const v = lsGet('fzp.cssPxPerMm')
  return v ? Number(v) : null
}

/** 家长设置页：所有训练配置集中在此，配一次即可，孩子训练路径不再碰这些 */
export function SettingsPage({ onReplayGuide, onOpenSpeech, onOpenCalib }: { onReplayGuide: () => void; onOpenSpeech: () => void; onOpenCalib: () => void }) {
  const t = useT()
  const lang = useLang()
  const [sizeMm, setSizeMm] = useState(() => {
    const v = lsGet('fzp.optotypeSizeMm')
    return v ? Number(v) : 1
  })
  const [durationSec, setDurationSec] = useState(() => {
    const v = lsGet('fzp.durationSec')
    return v ? Number(v) : 180
  })
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

  useEffect(() => {
    void getHomeStats(toDateStr(new Date())).then((s) => setTotalPoints(s.totalPoints))
  }, [])
  useEffect(() => { lsSet('fzp.optotypeSizeMm', String(sizeMm)) }, [sizeMm])
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

      <div className="fq-card" style={{ marginTop: 14 }}>
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

      <div className="fq-card" style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{t('settings.duration')}</span>
        <div className="fq-seg">
          {[60, 120, 180, 300].map((sec) => (
            <button key={sec} className={durationSec === sec ? 'on' : ''} onClick={() => setDurationSec(sec)}>
              {sec / 60}{t('settings.minute')}
            </button>
          ))}
        </div>
      </div>

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
