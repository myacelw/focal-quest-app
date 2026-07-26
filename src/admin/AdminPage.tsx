import { useEffect, useState, type CSSProperties } from 'react'
import { useT } from '../i18n'
import { LineChart } from '../stats/LineChart'
import { fetchAdminStats, type AdminStats } from './admin-api'
import { isoDate, kindLabelKey, metricLabel, shortDate } from './format'

const TH: CSSProperties = {
  textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)',
  padding: '4px 6px', whiteSpace: 'nowrap',
}
const TD: CSSProperties = {
  fontSize: 12, padding: '6px', borderTop: '1px solid var(--line)', whiteSpace: 'nowrap',
}
const SCROLL: CSSProperties = { overflowX: 'auto' }
const TABLE: CSSProperties = { width: '100%', borderCollapse: 'collapse', minWidth: 280 }

/**
 * 管理后台（迭代 3e，spec §8）。**只给站长自己看**：入口在设置页且仅 is_admin 账号可见，
 * 端点也独立校验，两道都过不了就只显示一行提示。
 *
 * 图表复用 src/stats 的手绘 SVG + 糖果主题，不引图表库。
 * 一次性/复杂查询刻意不做 UI——用 Cloudflare 控制台的 D1 Console 跑 SQL 就行，
 * 自用服务没必要开放"任意 SQL"的攻击面（常用排障 SQL 见部署文档）。
 */
export function AdminPage() {
  const t = useT()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(): Promise<void> {
    setLoading(true)
    const r = await fetchAdminStats()
    if (r.ok) {
      setStats(r.stats)
      setErrorKey(null)
    } else {
      setErrorKey(r.errorKey)
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  if (stats === null) {
    return (
      <div className="fq-page fq-rise">
        <h2 className="fq-h2">{t('admin.title')}</h2>
        {loading
          ? <p className="fq-sub">{t('admin.loading')}</p>
          : (
            <>
              <div className="fq-card" style={{ marginTop: 14, color: '#e8590c', fontSize: 13 }}>
                {t(errorKey ?? 'admin.error')}
              </div>
              <button className="fq-btn" style={{ marginTop: 12 }} onClick={() => void load()}>
                {t('admin.refresh')}
              </button>
            </>
          )}
      </div>
    )
  }

  const { totals, active, kinds, daily, recentUsers, inviters, abuse } = stats

  return (
    <div className="fq-page fq-rise">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h2 className="fq-h2">{t('admin.title')}</h2>
        <button className="fq-btn" onClick={() => void load()} disabled={loading}>
          {loading ? t('admin.loading') : t('admin.refresh')}
        </button>
      </div>
      <p className="fq-sub">
        {t('admin.updatedAt', { when: new Date(stats.generatedAt).toLocaleString() })}
        {/* 首次加载成功之后再失败（后端挂了 / token 失效）时，这里是唯一的提示。
            没有它，点「刷新」的结果就是"什么都没发生"——数字还是旧的、按钮又变回可点，
            站长会把陈旧数据当成当前状态。 */}
        {errorKey !== null && (
          <span style={{ color: '#e8590c', fontSize: 12, marginLeft: 8 }}>{t(errorKey)}</span>
        )}
      </p>

      <div className="fq-card" style={{ marginTop: 14, display: 'flex', alignItems: 'center' }}>
        <div className="fq-stat"><div className="n">{totals.users}</div><div className="l">{t('admin.totals.users')}</div></div>
        <div style={{ width: 1, height: 36, background: 'var(--line)' }} />
        <div className="fq-stat"><div className="n">{totals.records}</div><div className="l">{t('admin.totals.records')}</div></div>
        <div style={{ width: 1, height: 36, background: 'var(--line)' }} />
        <div className="fq-stat"><div className="n">{totals.tokens}</div><div className="l">{t('admin.totals.tokens')}</div></div>
      </div>

      <div className="fq-card" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div className="fq-stat"><div className="n">{active.dau}</div><div className="l">{t('admin.dau')}</div></div>
          <div style={{ width: 1, height: 36, background: 'var(--line)' }} />
          <div className="fq-stat"><div className="n">{active.wau}</div><div className="l">{t('admin.wau')}</div></div>
          <div style={{ width: 1, height: 36, background: 'var(--line)' }} />
          <div className="fq-stat"><div className="n">{active.mau}</div><div className="l">{t('admin.mau')}</div></div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
          {t('admin.openTitle')}: {active.openDau} / {active.openWau} / {active.openMau} — {t('admin.openHint')}
        </div>
      </div>

      <div className="fq-card" style={{ marginTop: 14 }}>
        <div className="fq-card-title">{t('admin.dailyTitle')}</div>
        <LineChart values={daily.map((d) => d.count)} labels={daily.map((d) => shortDate(d.date))} />
      </div>

      <div className="fq-card" style={{ marginTop: 14 }}>
        <div className="fq-card-title">{t('admin.kindsTitle')}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* count 是累计量、括号里是近 7 天新增（spec §8 要的"记录量与增速"）：
              30 天曲线只覆盖 session，其余 6 类只有这个 recent 看得出在不在长 */}
          {kinds.map((k) => {
            const key = kindLabelKey(k.kind)
            return (
              <span key={k.kind} className="fq-chip">
                {key !== null ? t(key) : k.kind} · {k.count}
                {k.recent > 0 ? `（+${k.recent}）` : ''}
              </span>
            )
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>{t('admin.kindsHint')}</div>
      </div>

      <div className="fq-card" style={{ marginTop: 14 }}>
        <div className="fq-card-title">{t('admin.recentTitle')}</div>
        {recentUsers.length === 0 ? <p style={{ fontSize: 12, color: 'var(--muted)' }}>{t('admin.empty')}</p> : (
          <div style={SCROLL}>
            <table style={TABLE}>
              <thead>
                <tr>
                  <th style={TH}>{t('admin.col.email')}</th>
                  <th style={TH}>{t('admin.col.at')}</th>
                  <th style={TH}>{t('admin.recentInviter')}</th>
                </tr>
              </thead>
              <tbody>
                {recentUsers.map((u) => (
                  <tr key={u.email}>
                    <td style={TD}>{u.isAdmin ? '🛠 ' : ''}{u.email}</td>
                    <td style={TD}>{isoDate(u.createdAt)}</td>
                    <td style={TD}>{u.invitedByEmail ?? t('admin.recentNoInviter')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="fq-card" style={{ marginTop: 14 }}>
        <div className="fq-card-title">{t('admin.invitersTitle')}</div>
        {inviters.length === 0 ? <p style={{ fontSize: 12, color: 'var(--muted)' }}>{t('admin.empty')}</p> : (
          <div style={SCROLL}>
            <table style={TABLE}>
              <thead>
                <tr>
                  <th style={TH}>{t('admin.col.email')}</th>
                  <th style={TH}>{t('admin.col.invited')}</th>
                  <th style={TH}>{t('admin.col.quota')}</th>
                </tr>
              </thead>
              <tbody>
                {inviters.map((x) => (
                  <tr key={x.email}>
                    <td style={TD}>{x.email}</td>
                    <td style={TD}>{x.invited}</td>
                    <td style={TD}>{x.quota}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="fq-card" style={{ marginTop: 14 }}>
        <div className="fq-card-title">{t('admin.abuseTitle')}</div>
        {abuse.length === 0 ? <p style={{ fontSize: 12, color: 'var(--muted)' }}>{t('admin.empty')}</p> : (
          <div style={SCROLL}>
            <table style={TABLE}>
              <thead>
                <tr>
                  <th style={TH}>{t('admin.col.metric')}</th>
                  <th style={TH}>{t('admin.col.value')}</th>
                </tr>
              </thead>
              <tbody>
                {abuse.map((row) => {
                  const label = metricLabel(row.metric)
                  return (
                    <tr key={row.metric}>
                      <td style={TD}>{label !== null ? t(label.key, label.params) : row.metric}</td>
                      <td style={TD}>{row.total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.7, marginTop: 16 }}>
        {t('admin.caveat')}
      </p>
    </div>
  )
}
