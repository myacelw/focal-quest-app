import { Component, type ReactNode, type ErrorInfo } from 'react'

/**
 * 全局错误兜底：任何渲染期未捕获异常，默认会让整棵 React 树卸载 → 用户看到的就是「白屏」。
 * 这里把它兜住，改为显示友好界面 + 重新加载按钮 + 可展开的错误详情，避免白屏无从下手。
 *
 * 为什么值得加：本 app 之前没有任何 error boundary，一处渲染异常就整屏白。尤其 iPad Safari
 * 在内存压力/资源加载失败下的行为跟桌面不同，可能触发桌面复现不到的异常——有了它，白屏会变成
 * 一段可截图的报错，方便定位真正的根因（把不可见的白屏变成可诊断的信息）。
 */
interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 保留到控制台，便于 iPad 连电脑 Safari「开发」菜单抓完整栈
    console.error('[FocalQuest] 渲染异常被 ErrorBoundary 兜住：', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '48px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 52 }}>😵</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginTop: 10, color: 'var(--ink, #33285a)' }}>
          出了点小问题 · Something went wrong
        </h2>
        <p style={{ color: 'var(--muted, #9a8fc0)', marginTop: 10, lineHeight: 1.7, fontSize: 14 }}>
          页面出错了，但你的训练数据都安全存在本机，不会丢。点下面按钮重新加载即可继续。
          <br />
          Your data is safe on this device — tap reload to continue.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 22,
            padding: '12px 30px',
            fontSize: 16,
            fontWeight: 800,
            color: '#fff',
            background: 'linear-gradient(135deg, #7c6cf0, #8b6cff)',
            border: 'none',
            borderRadius: 14,
            cursor: 'pointer',
            boxShadow: '0 6px 18px rgba(108,75,240,0.35)',
          }}
        >
          🔄 重新加载 · Reload
        </button>
        <details style={{ marginTop: 24, textAlign: 'left' }}>
          <summary style={{ color: 'var(--muted, #9a8fc0)', fontSize: 12, cursor: 'pointer' }}>
            错误详情（可截图发给家长排查）
          </summary>
          <pre
            style={{
              marginTop: 8,
              padding: 12,
              fontSize: 11,
              lineHeight: 1.5,
              background: 'rgba(108,75,240,0.06)',
              borderRadius: 10,
              overflow: 'auto',
              color: '#c0392b',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {String(error.stack || error.message || error)}
          </pre>
        </details>
      </div>
    )
  }
}
