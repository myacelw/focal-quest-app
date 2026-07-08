import { useState } from 'react'

const STEPS = [
  { icon: '📐', title: '先标定屏幕', desc: '用一张银行卡对齐一次，视标的物理尺寸才准确（首次必做）。' },
  { icon: '🪑', title: '坐姿与距离', desc: '遮住一只眼，坐直，眼睛离屏幕约 40cm（可以用一根绳量一下）。' },
  { icon: '🔍', title: '看清再回答', desc: '透过拍子努力看清那个字/怪兽，看清后说出缺口方向（上下左右），或点屏幕按钮。' },
  { icon: '🔄', title: '翻转拍子', desc: '答完把拍子翻个面，再看清下一个——这一翻，就是在锻炼眼睛"变焦"的能力。' },
  { icon: '📅', title: '每天坚持', desc: '每只眼约 3 分钟，重在每天练、坚持几周，效果才会显现。' },
]

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const last = i === STEPS.length - 1
  const step = STEPS[i]

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
          怎么正确训练 · {i + 1}/{STEPS.length}
        </div>
        <div style={{ fontSize: 60, margin: '14px 0 10px' }}>{step.icon}</div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{step.title}</div>
        <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.65, marginTop: 8, minHeight: 72 }}>{step.desc}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '14px 0' }}>
          {STEPS.map((_, k) => (
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
          {last ? '开始训练吧！' : '下一步'}
        </button>
        {!last && (
          <button className="fq-btn" style={{ marginTop: 8, width: '100%', border: 'none', background: 'transparent' }} onClick={onDone}>
            跳过
          </button>
        )}
      </div>
    </div>
  )
}
