import { useEffect, useState } from 'react'
import type { ExamRow } from '../data/db'
import { listExams, addExam, deleteExam } from './exams-service'
import { isValidAcuity } from './acuity'
import { toDateStr } from '../data/date-utils'
import { useT } from '../i18n'

/** 设置页家长区：验光记录增删（只增删不改） */
export function ExamConfig() {
  const t = useT()
  const [exams, setExams] = useState<ExamRow[]>([])
  const [date, setDate] = useState(() => toDateStr(new Date()))
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function refresh() { setExams(await listExams()) }
  useEffect(() => { void refresh() }, [])

  async function onAdd() {
    const l = Number(left)
    const r = Number(right)
    if (!date || !isValidAcuity(l) || !isValidAcuity(r)) { setErr(t('exam.invalid')); return }
    setErr(null)
    await addExam({ date, left: l, right: r, note: note.trim() || undefined })
    setLeft(''); setRight(''); setNote('')
    await refresh()
  }

  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>{t('exam.hint')}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--line)' }} />
        <input value={left} onChange={(e) => setLeft(e.target.value)} inputMode="decimal" placeholder={t('exam.left')} style={{ width: 76, padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--line)' }} />
        <input value={right} onChange={(e) => setRight(e.target.value)} inputMode="decimal" placeholder={t('exam.right')} style={{ width: 76, padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--line)' }} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('exam.note')} style={{ flex: '1 1 120px', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--line)' }} />
        <button className="fq-btn" onClick={() => void onAdd()}>{t('exam.add')}</button>
      </div>
      {err && <p style={{ fontSize: 12, color: '#e8590c', marginTop: 8 }}>{err}</p>}
      {exams.map((x) => (
        <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 13 }}>
          <span>{x.date} · {t('exam.left')} {x.left.toFixed(1)} / {t('exam.right')} {x.right.toFixed(1)}{x.note ? ` · ${x.note}` : ''}</span>
          <button className="fq-btn" onClick={async () => { if (!window.confirm(t('exam.deleteConfirm', { date: x.date }))) return; await deleteExam(x.id!); await refresh() }}>{t('exam.delete')}</button>
        </div>
      ))}
    </>
  )
}
