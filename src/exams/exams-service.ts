import { db, type ExamRow } from '../data/db'
import { pushExams, pushExamDeleted } from '../data/api'

/** 全部验光记录，按日期升序 */
export async function listExams(): Promise<ExamRow[]> {
  const all = await db.exams.toArray()
  return all.sort((a, b) => (a.date < b.date ? -1 : 1))
}

export async function addExam(exam: Omit<ExamRow, 'id'>): Promise<void> {
  const id = await db.exams.add(exam)
  pushExams([{ ...exam, id }])
}

/**
 * 删除验光记录：本地真删 + 推墓碑。
 * 3b 起删除必须传播——单向备份时代"只删本地"是合理的，但真同步下不传播删除，
 * A 设备删掉的记录会被 B 设备的数据复活（spec §6.1 明示这是有意变更）。
 */
export async function deleteExam(id: number): Promise<void> {
  const row = await db.exams.get(id)
  await db.exams.delete(id)
  if (row?.uuid) pushExamDeleted(row.uuid)
}
