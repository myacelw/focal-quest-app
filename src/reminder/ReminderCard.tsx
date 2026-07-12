import { useState } from 'react'
import { buildReminderIcs } from './ics'
import { lsGet, lsSet } from '../data/storage'
import { toDateStr } from '../data/date-utils'
import { useT } from '../i18n'

/** 设置页：每日提醒卡（生成每日重复的 .ics 日历文件，零后端） */
export function ReminderCard() {
  const t = useT()
  const [time, setTime] = useState(() => lsGet('fzp.reminderTime') || '19:00')

  function onAdd() {
    lsSet('fzp.reminderTime', time)
    const ics = buildReminderIcs(toDateStr(new Date()), time, t('reminder.icsSummary'), t('reminder.icsDesc'))
    const blob = new Blob([ics], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const aEl = document.createElement('a')
    aEl.href = url
    aEl.download = 'focalquest-reminder.ics'
    aEl.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>{t('reminder.hint')}</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13 }}>{t('reminder.time')}</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--line)' }} />
        <button className="fq-btn" onClick={onAdd}>{t('reminder.add')}</button>
      </div>
    </>
  )
}
