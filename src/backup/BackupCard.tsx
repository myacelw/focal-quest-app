import { useRef, useState } from 'react'
import { exportBackup, parseBackupFile, restoreBackup, lastBackupAt } from './backup-service'
import { toDateStr } from '../data/date-utils'
import { useT } from '../i18n'

const OVERDUE_MS = 30 * 24 * 3600 * 1000   // 超 30 天提示

/** 设置页：数据备份卡（导出 / 导入恢复 / 上次备份超期提醒） */
export function BackupCard() {
  const t = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const [last, setLast] = useState<number | null>(() => lastBackupAt())
  const [msg, setMsg] = useState<string | null>(null)

  const overdue = last === null || Date.now() - last > OVERDUE_MS
  const lastText = last === null
    ? t('backup.never')
    : overdue
      ? t('backup.overdue', { when: toDateStr(new Date(last)) })
      : t('backup.last', { when: toDateStr(new Date(last)) })

  async function onImport(f: File) {
    const file = await parseBackupFile(f)
    if (!file) { setMsg(t('backup.badFile')); return }
    if (!window.confirm(t('backup.confirm', { date: toDateStr(new Date(file.exportedAt)) }))) return
    await restoreBackup(file)
    window.alert(t('backup.done'))
    window.location.reload()
  }

  return (
    <div className="fq-card" style={{ marginTop: 14, textAlign: 'left' }}>
      <div className="fq-card-title">{t('backup.title')}</div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 10px' }}>{t('backup.hint')}</p>
      <div style={{ fontSize: 13, fontWeight: 700, color: overdue ? '#e8590c' : 'var(--muted)', marginBottom: 10 }}>{lastText}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="fq-btn" onClick={async () => { await exportBackup(); setLast(lastBackupAt()) }}>{t('backup.export')}</button>
        <button className="fq-btn" onClick={() => fileRef.current?.click()}>{t('backup.import')}</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImport(f); e.target.value = '' }}
        />
      </div>
      {msg && <p style={{ fontSize: 12, color: '#e8590c', marginTop: 8 }}>{msg}</p>}
    </div>
  )
}
