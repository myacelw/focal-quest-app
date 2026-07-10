import { describe, it, expect } from 'vitest'
import { buildBackup, validateBackup, backupFilename, type BackupTables } from './backup'

const emptyTables: BackupTables = {
  sessions: [], checkins: [], badges: [], monsters: [], rewards: [], redemptions: [], exams: [],
}

describe('buildBackup / validateBackup', () => {
  it('组装含标识/版本/时间/全部 7 表/设置', () => {
    const f = buildBackup(emptyTables, { 'fzp.lang': 'zh' }, 1234)
    expect(f.app).toBe('focal-quest')
    expect(f.version).toBe(1)
    expect(f.exportedAt).toBe(1234)
    expect(Object.keys(f.tables).sort()).toEqual(
      ['badges', 'checkins', 'exams', 'monsters', 'redemptions', 'rewards', 'sessions'],
    )
    expect(f.settings['fzp.lang']).toBe('zh')
  })
  it('validate 接受合法文件', () => {
    expect(validateBackup(buildBackup(emptyTables, {}, 1))).toBe(true)
  })
  it('validate 拒绝非对象/标识不符/版本不符', () => {
    expect(validateBackup(null)).toBe(false)
    expect(validateBackup('x')).toBe(false)
    expect(validateBackup({ ...buildBackup(emptyTables, {}, 1), app: 'other' })).toBe(false)
    expect(validateBackup({ ...buildBackup(emptyTables, {}, 1), version: 2 })).toBe(false)
  })
  it('validate 拒绝缺表/表非数组/缺 settings', () => {
    const good = buildBackup(emptyTables, {}, 1)
    const missing = JSON.parse(JSON.stringify(good)) as { tables: Record<string, unknown> }
    delete missing.tables.exams
    expect(validateBackup(missing)).toBe(false)
    expect(validateBackup({ ...good, tables: { ...good.tables, badges: 'x' } })).toBe(false)
    expect(validateBackup({ ...good, settings: null })).toBe(false)
  })
  it('roundtrip：JSON 序列化再解析仍合法且数据一致', () => {
    const tables: BackupTables = {
      ...emptyTables,
      checkins: [{ date: '2026-07-10', streak: 3, dailyPoints: 50, totalPoints: 500 }],
      monsters: [{ id: 'space-ufo', capturedAt: 111, source: 'daily' }],
    }
    const f = buildBackup(tables, { 'fzp.cssPxPerMm': '4.2' }, 999)
    const parsed: unknown = JSON.parse(JSON.stringify(f))
    expect(validateBackup(parsed)).toBe(true)
    expect(parsed).toEqual(f)
  })
})

describe('backupFilename', () => {
  it('按日期拼文件名', () => {
    expect(backupFilename('2026-07-10')).toBe('focalquest-backup-2026-07-10.json')
  })
})
