import { db, type ExamRow } from '../data/db'
import { pushExams } from '../data/api'

/** 全部验光记录，按日期升序 */
export async function listExams(): Promise<ExamRow[]> {
  const all = await db.exams.toArray()
  return all.sort((a, b) => (a.date < b.date ? -1 : 1))
}

export async function addExam(exam: Omit<ExamRow, 'id'>): Promise<void> {
  const id = await db.exams.add(exam)
  pushExams([{ ...exam, id }])
}

/** 删除仅本地（后端是防丢副本非镜像，与其他表策略一致） */
export async function deleteExam(id: number): Promise<void> {
  await db.exams.delete(id)
}
