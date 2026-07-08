import { useEffect, useState } from 'react'
import { TumblingE } from './training/TumblingE'
import { acuityFromHeightMm } from './training/optotype-size'
import { getHomeStats } from './data/checkin'
import { lsGet, lsSet } from './data/storage'
import { toDateStr } from './data/date-utils'
import { getSkin, getSkinId, setSkinId, isSkinUnlocked, skinUnlockCost, SKINS } from './skins/registry'

function readPxPerMm(): number | null {
  const v = lsGet('fzp.cssPxPerMm')
  return v ? Number(v) : null
}

/** 家长设置页：所有训练配置集中在此，配一次即可，孩子训练路径不再碰这些 */
export function SettingsPage({ onReplayGuide, onOpenSpeech, onOpenCalib }: { onReplayGuide: () => void; onOpenSpeech: () => void; onOpenCalib: () => void }) {
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
  const [skinId, setSkinIdState] = useState(() => getSkinId())
  const [totalPoints, setTotalPoints] = useState<number | null>(null)

  useEffect(() => {
    void getHomeStats(toDateStr(new Date())).then((s) => setTotalPoints(s.totalPoints))
  }, [])
  useEffect(() => { lsSet('fzp.optotypeSizeMm', String(sizeMm)) }, [sizeMm])
  useEffect(() => { lsSet('fzp.durationSec', String(durationSec)) }, [durationSec])
  useEffect(() => { lsSet('fzp.flipperD', String(flipperD)) }, [flipperD])

  const pxPerMm = readPxPerMm()
  const tp = totalPoints ?? 0
  const effectiveSkinId = totalPoints === null || isSkinUnlocked(skinId, totalPoints) ? skinId : 'plain'
  const CurrentSkin = getSkin(effectiveSkinId)

  return (
    <div className="fq-page fq-rise">
      <h2 className="fq-h2">⚙️ 设置</h2>
      <p className="fq-sub">家长在这里配一次，孩子训练时就不用管这些了。</p>

      <div className="fq-card" style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="fq-card-title" style={{ marginBottom: 4 }}>📐 屏幕标定</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {pxPerMm !== null
              ? `已标定（${pxPerMm.toFixed(1)} px/mm）——视标物理尺寸才准`
              : '未标定——用银行卡校准一次，视标尺寸才准（先做这步）'}
          </div>
        </div>
        <button className="fq-btn" onClick={onOpenCalib}>{pxPerMm !== null ? '重新标定' : '去标定'}</button>
      </div>

      <div className="fq-card" style={{ marginTop: 14 }}>
        <div className="fq-card-title">👁️ 视标大小</div>
        {pxPerMm !== null ? (
          <>
            <div style={{ fontSize: 14 }}>
              <b style={{ color: 'var(--violet)' }}>{sizeMm.toFixed(1)} mm</b>
              <span style={{ color: 'var(--muted)' }}>（≈ {acuityFromHeightMm(sizeMm).toFixed(2)} 视力）</span>
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
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>调到孩子透过负镜片要努力才看清的大小——太大没训练强度，太小易放弃（实测约 0.7mm）</p>
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>请先用上方「📐 屏幕标定」完成校准，才能设视标大小。</p>
        )}
      </div>

      <div className="fq-card" style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>⏱️ 单眼时长</span>
        <div className="fq-seg">
          {[60, 120, 180, 300].map((sec) => (
            <button key={sec} className={durationSec === sec ? 'on' : ''} onClick={() => setDurationSec(sec)}>
              {sec / 60}分
            </button>
          ))}
        </div>
      </div>

      <div className="fq-card" style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>🔵 拍子度数</span>
        <div className="fq-seg">
          {[1.5, 2, 2.5].map((d) => (
            <button key={d} className={flipperD === d ? 'on' : ''} onClick={() => setFlipperD(d)}>
              ±{d.toFixed(2)}
            </button>
          ))}
        </div>
      </div>

      <div className="fq-card" style={{ marginTop: 14 }}>
        <div className="fq-card-title">🎨 皮肤</div>
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
                title={unlocked ? s.name : `练满 ${cost} 分解锁`}
                onClick={() => { if (!unlocked) return; setSkinId(s.id); setSkinIdState(s.id) }}
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
            if (locked.length === 0) return ' · 已全部解锁 🎉'
            const nearest = Math.min(...locked.map((s) => skinUnlockCost(s.id)))
            return ` · 再练 ${nearest - tp} 分解锁新皮肤`
          })()}
        </div>
        <div style={{ maxWidth: 200, margin: '12px auto 0', borderRadius: 14, overflow: 'hidden' }}>
          <CurrentSkin.Stage target="up" heightPx={28} phase="showing" lastAnswer={null} isEgg={false} />
        </div>
      </div>

      <div className="fq-card" style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>📖 怎么正确训练</span>
        <button className="fq-btn" onClick={onReplayGuide}>重看引导</button>
      </div>

      <div className="fq-card" style={{ marginTop: 14 }}>
        <div className="fq-card-title">📋 关于训练（家长必读）</div>
        <ul style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.75, paddingLeft: 18, margin: 0 }}>
          <li>软件负责节奏引导和记录；真正的调节训练靠孩子透过拍子<b>努力看清</b>再翻转。</li>
          <li>坐正、离屏幕约 <b>40cm</b>、遮好单眼——距离和遮眼直接影响效果。</li>
          <li>坚持<b>每天练</b>，调节训练通常 <b>4–6 周</b>才逐渐见效，别几天没效果就放弃。</li>
          <li>CPM / 反应时间是<b>趋势参考</b>（和自己比、在变快就是进步），不是医学诊断；需专业评估请找视光师。</li>
        </ul>
      </div>

      <p style={{ textAlign: 'center', marginTop: 20 }}>
        <button
          onClick={onOpenSpeech}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
        >
          🎤 语音识别测试（调试用）
        </button>
      </p>
    </div>
  )
}
