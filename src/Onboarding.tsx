import { useState } from 'react'
import { useT } from './i18n'

const STEP_ICONS = ['📐', '🪑', '🔍', '🔄', '📅']

export function Onboarding({ onDone }: { onDone: () => void }) {
  const t = useT()
  const [i, setI] = useState(0)
  const last = i === STEP_ICONS.length - 1
  const step = {
    icon: STEP_ICONS[i],
    title: t(`onboard.step${i + 1}.title`),
    desc: t(`onboard.step${i + 1}.desc`),
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(51,40,90,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
      }}
    >
      <div className="fq-card fq-rise" style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>
          {t('onboard.stepOf', { i: i + 1, total: STEP_ICONS.length })}
        </div>
        <div style={{ fontSize: 60, margin: '14px 0 10px' }}>{step.icon}</div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{step.title}</div>
        <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.65, marginTop: 8, minHeight: 72 }}>{step.desc}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '14px 0' }}>
          {STEP_ICONS.map((_, k) => (
            <div
              key={k}
              style={{
                width: k === i ? 20 : 7,
                height: 7,
                borderRadius: 999,
                background: k === i ? 'var(--violet)' : 'var(--line)',
                transition: 'width 0.2s ease',
              }}
            />
          ))}
        </div>
        <button className="fq-cta" style={{ width: '100%' }} onClick={() => (last ? onDone() : setI(i + 1))}>
          {last ? t('onboard.startTraining') : t('onboard.next')}
        </button>
        {!last && (
          <button className="fq-btn" style={{ marginTop: 8, width: '100%', border: 'none', background: 'transparent' }} onClick={onDone}>
            {t('onboard.skip')}
          </button>
        )}
      </div>
    </div>
  )
}
