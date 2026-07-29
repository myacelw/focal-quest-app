import { useEffect, useState, type CSSProperties } from 'react'
import { useT, Rich } from '../i18n'
import { getAccount, clearAccount, registerAccount, loginAccount, getMeta, META, type Account } from './account'
import { validateCredentials } from './credentials'
import { fetchInviteState, rotateInviteCode } from './invite-api'
import { syncNow } from './engine'
import { db } from '../data/db'
import { toDateStr } from '../data/date-utils'

type Tab = 'login' | 'register'
type Status = 'idle' | 'working' | 'ok' | 'failed'

const FIELD: CSSProperties = { padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--line)' }

/**
 * 设置页「☁️ 云同步」卡。
 *  - 未登录 → 登录 / 注册切换表单；注册必须勾「监护人同意」才可提交（spec §7.2）。
 *  - 已登录 → 账号、专属邀请码（可复制）、待上传条数、上次同步时间、手动同步、退出登录。
 * 红线：**不注册也能正常使用**，本卡片的任何失败都不影响训练。
 */
export function CloudSyncCard({ onOpenPrivacy, onAccountChange }: {
  onOpenPrivacy: () => void
  /**
   * 登录/注册/退出后回调。设置页据此重读 isAdmin 决定要不要显示管理后台入口——
   * 它自己那个 effect 依赖是 []，只在挂载时读一次，而本卡片就嵌在同一页里，
   * 在页内登录不会让设置页重新挂载，入口会一直不出现（要切走再回来才行）。
   */
  onAccountChange?: () => void
}) {
  const t = useT()
  const [acc, setAcc] = useState<Account | null>(null)
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invite, setInvite] = useState('')
  const [consent, setConsent] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [pending, setPending] = useState(0)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [inviteUsage, setInviteUsage] = useState<{ used: number; quota: number } | null>(null)
  const [rotating, setRotating] = useState(false)

  /**
   * 拉一次服务端的权威邀请码状态。
   * 失败（离线）时**什么都不改**——保留 syncMeta 里的快照码，只是不显示名额；
   * 显示 "0/5" 是撒谎，清空成转圈或空白是退步。
   */
  async function loadInvite(): Promise<void> {
    const r = await fetchInviteState()
    if (!r.ok) return
    setInviteUsage({ used: r.state.used, quota: r.state.quota })
    setAcc((prev) => (prev === null ? prev : { ...prev, inviteCode: r.state.inviteCode, isAdmin: r.state.isAdmin }))
    onAccountChange?.()
  }

  async function refresh(): Promise<void> {
    const [a, n, at, err] = await Promise.all([
      getAccount(),
      db.outbox.count(),
      getMeta(META.lastSyncedAt),
      getMeta(META.lastError),
    ])
    setAcc(a)
    setPending(n)
    setLastSyncedAt(at ? Number(at) : null)
    setLastError(err !== null && err !== '' ? err : null)
    onAccountChange?.()
    if (a !== null) void loadInvite()
  }

  useEffect(() => { void refresh() }, [])

  async function onSubmit(): Promise<void> {
    // 本地前置校验：客户端是**唯一**能校验密码强度的地方（服务端只看到 64 位 hex），
    // 且能省下一次白跑的 31 万次 PBKDF2。
    const bad = validateCredentials(email, password)
    if (bad !== null) {
      setErrorKey(bad === 'badEmail' ? 'sync.err.badEmail' : 'sync.err.badPassword')
      setStatus('failed')
      return
    }
    setStatus('working')
    setErrorKey(null)
    const r = tab === 'register'
      ? await registerAccount(email, password, invite)
      // 换了另一个账号且本机有数据时先问一次，默认不并入——防跨账号串账（一期不可撤回）
      : await loginAccount(email, password, {
        confirmMerge: async (n) => window.confirm(t('sync.mergeConfirm', { n })),
      })
    if (!r.ok) {
      setErrorKey(r.errorKey)
      setStatus('failed')
      return
    }
    setPassword('') // 立刻从内存里丢掉密码
    setStatus('idle')
    await refresh()
    // 登录成功后立刻跑一轮：把存量推上去、把该账号的历史拉下来
    void syncNow().then(() => refresh())
  }

  async function onSyncNow(): Promise<void> {
    setStatus('working')
    const r = await syncNow()
    setStatus(r === 'ok' ? 'ok' : 'failed')
    await refresh()
  }

  async function onLogout(): Promise<void> {
    if (!window.confirm(t('sync.logoutConfirm'))) return
    await clearAccount()
    setStatus('idle')
    setInviteUsage(null)
    await refresh()
  }

  async function onRotate(): Promise<void> {
    if (!window.confirm(t('sync.inviteRotateConfirm'))) return
    setRotating(true)
    const r = await rotateInviteCode()
    setRotating(false)
    if (!r.ok) {
      setErrorKey(r.errorKey)
      return
    }
    setErrorKey(null)
    setInviteUsage({ used: r.state.used, quota: r.state.quota })
    setAcc((prev) => (prev === null ? prev : { ...prev, inviteCode: r.state.inviteCode, isAdmin: r.state.isAdmin }))
    // 码换掉了，"已复制 ✓" 必须收回——否则家长以为剪贴板里是新码，实际是刚作废的那个
    setCopied(false)
    onAccountChange?.()
  }

  if (acc !== null) {
    return (
      <>
        <div style={{ fontSize: 13 }}>
          <b>{t('sync.account')}</b>：{acc.email}
        </div>
        <div style={{ fontSize: 13, marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <b>{t('sync.myInvite')}</b>
          <code style={{ letterSpacing: 1, fontSize: 14 }}>{acc.inviteCode}</code>
          <button
            className="fq-btn"
            onClick={() => { void navigator.clipboard?.writeText(acc.inviteCode); setCopied(true) }}
          >
            {copied ? t('sync.copied') : t('sync.copy')}
          </button>
          {inviteUsage !== null && (
            <span style={{ color: 'var(--muted)' }}>
              {t('sync.inviteUsage', { used: inviteUsage.used, quota: inviteUsage.quota })}
            </span>
          )}
          {acc.isAdmin && (
            <button className="fq-btn" disabled={rotating} onClick={() => void onRotate()}>
              {rotating ? t('sync.working') : t('sync.inviteRotate')}
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0' }}>{t('sync.inviteHint')}</p>

        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 12 }}>
          {lastSyncedAt === null ? t('sync.neverSynced') : t('sync.lastSynced', { when: toDateStr(new Date(lastSyncedAt)) })}
          {' · '}
          {pending > 0 ? t('sync.pending', { n: pending }) : t('sync.pendingNone')}
        </div>
        {lastError === 'unauthorized' && (
          <p style={{ fontSize: 13, color: '#e8590c', marginTop: 8 }}>{t('sync.needRelogin')}</p>
        )}
        {lastError === 'rejected' && (
          // 有记录被服务端永久拒收（已隔离）。必须显式告知，否则家长只看到"待上传"数字变化，
          // 完全不知道云端少了东西。
          <p style={{ fontSize: 13, color: '#e8590c', marginTop: 8 }}>{t('sync.err.rejected')}</p>
        )}
        {status === 'ok' && <p style={{ fontSize: 13, color: '#1d9e75', marginTop: 8 }}>{t('sync.syncOk')}</p>}
        {status === 'failed' && <p style={{ fontSize: 13, color: '#e8590c', marginTop: 8 }}>{t('sync.syncFailed')}</p>}
        {/* 已登录分支原本不渲染 errorKey，而它是换码失败的唯一出口 */}
        {errorKey !== null && <p style={{ fontSize: 13, color: '#e8590c', marginTop: 8 }}>{t(errorKey)}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="fq-btn" disabled={status === 'working'} onClick={() => void onSyncNow()}>
            {status === 'working' ? t('sync.working') : t('sync.syncNow')}
          </button>
          <button className="fq-btn" onClick={() => void onLogout()}>{t('sync.logout')}</button>
          <button className="fq-btn" onClick={onOpenPrivacy}>{t('sync.privacyOpen')}</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>{t('sync.logoutHint')}</p>
      </>
    )
  }

  // 提交要求：邮箱格式合法 + 密码 ≥8 位（本地校验，见 credentials.ts），
  // 注册还要邀请码 + 监护人同意勾选（不勾不能注册，spec §7.2）
  const canSubmit = validateCredentials(email, password) === null &&
    (tab === 'login' || (invite.trim() !== '' && consent))

  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.7 }}>
        <Rich text={t('sync.hint')} />
      </p>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 10 }}>{t('sync.localOnly')}</div>

      <div className="fq-seg" style={{ marginBottom: 10 }}>
        {(['login', 'register'] as Tab[]).map((k) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setErrorKey(null) }}>
            {t(`sync.tab.${k}`)}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <input type="email" autoComplete="email" style={FIELD} placeholder={t('sync.email')}
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" autoComplete="current-password" style={FIELD} placeholder={t('sync.password')}
          value={password} onChange={(e) => setPassword(e.target.value)} />
        {tab === 'register' && (
          <input autoComplete="off" style={FIELD} placeholder={t('sync.invite')}
            value={invite} onChange={(e) => setInvite(e.target.value)} />
        )}
      </div>

      {tab === 'register' && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
          <span>{t('sync.consent')}</span>
        </label>
      )}

      {errorKey !== null && <p style={{ fontSize: 13, color: '#e8590c', marginTop: 8 }}>{t(errorKey)}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          className="fq-btn"
          disabled={!canSubmit || status === 'working'}
          style={{ opacity: canSubmit && status !== 'working' ? 1 : 0.5 }}
          onClick={() => void onSubmit()}
        >
          {status === 'working' ? t('sync.working') : t(tab === 'register' ? 'sync.register' : 'sync.login')}
        </button>
        <button className="fq-btn" onClick={onOpenPrivacy}>{t('sync.privacyOpen')}</button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.7 }}>
        <Rich text={t('sync.noteNoRecovery')} />
      </p>
    </>
  )
}
