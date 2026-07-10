import { useEffect, useState } from 'react'
import type { ExamRow } from '../data/db'
import { listExams } from '../exams/exams-service'
import { DualLineChart } from './DualLineChart'
import { useT } from '../i18n'

/**
 * 统计页「👁 视力趋势」卡：自取验光记录，双线展示左右眼趋势。
 * 独立组件——空态页与正常统计页都渲染它，避免"没训练记录就看不到已录验光趋势"。
 */
export function VisionTrendCard() {
  const t = useT()
  const [exams, setExams] = useState<ExamRow[]>([])
  useEffect(() => { void listExams().then(setExams) }, [])

  return (
    <div className="fq-card" style={{ marginTop: 14 }}>
      <div className="fq-card-title">{t('exam.chartTitle')}</div>
      {exams.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>{t('exam.chartEmpty')}</p>
      ) : (
        <DualLineChart
          a={exams.map((e) => e.left)}
          b={exams.map((e) => e.right)}
          labels={exams.map((e) => e.date.slice(5))}
          legendA={t('exam.left')}
          legendB={t('exam.right')}
        />
      )}
    </div>
  )
}
