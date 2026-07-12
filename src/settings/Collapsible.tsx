import { useState, type ReactNode } from 'react'

/**
 * 设置页折叠卡：默认收起，只显示标题行；点一下展开内容。
 * 把"重"功能（奖励/验光/备份/提醒/清空）收起来，让设置页清爽、按需展开。
 */
export function Collapsible({
  title, defaultOpen = false, danger = false, children,
}: {
  title: ReactNode
  defaultOpen?: boolean
  danger?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="fq-card" style={{ marginTop: 14, textAlign: 'left', ...(danger ? { border: '1.5px solid #ff5c86' } : {}) }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          background: 'none', border: 'none', padding: 0, font: 'inherit', width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer',
        }}
      >
        <span className="fq-card-title" style={{ marginBottom: 0, ...(danger ? { color: '#e8590c' } : {}) }}>{title}</span>
        <span style={{ color: 'var(--muted)', fontSize: 14, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flex: '0 0 auto' }}>▸</span>
      </button>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  )
}

/** 设置页分组小标题 */
export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div style={{ margin: '22px 0 2px', fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: 'var(--muted)' }}>
      {children}
    </div>
  )
}
